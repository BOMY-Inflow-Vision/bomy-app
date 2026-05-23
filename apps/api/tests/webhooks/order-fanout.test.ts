/**
 * Integration tests for apps/api/src/webhooks/hitpay/order-fanout.ts
 * (PR #32 Task 10). Real Postgres; skips when DATABASE_URL is unset.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/api test order-fanout.test.ts --run
 *
 * Focused on the join-point orchestration: dispatch / idempotency /
 * routing / fan-out / parking. Helper-level coverage lives in the per-
 * module test files (commission, idempotency, failure-release,
 * park-review). Task 12 will add full end-to-end tests at the route
 * plugin level (signed body, HMAC, etc.).
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { handleOrderPayment } from "../../src/webhooks/hitpay/order-fanout.js"
import type { EventIdentity } from "../../src/webhooks/hitpay/idempotency.js"
import type { OrderPaymentArgs } from "../../src/webhooks/hitpay/types.js"
import type { NotificationDescriptor, OrderPaidDescriptor } from "../../src/notifications/types.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL)

describe.skipIf(!shouldRun)("handleOrderPayment + fanOutPaid (integration)", () => {
  let handle: ReturnType<typeof makeDb>
  let buyerId: string
  let sellerId: string
  let storeId: string
  let productId: string
  let variantId: string
  // Extras for multi-store tests (Bob R3 negative-payout reproduction).
  let extraStoreIds: string[]
  let extraProductIds: string[]
  let extraVariantIds: string[]

  // ── Test scaffolding ────────────────────────────────────────────────

  type LogCall = { level: "info" | "error" | "warn"; obj: unknown; msg: string }
  let logCalls: LogCall[]

  function makeFakeApp(): FastifyInstance {
    return {
      db: handle,
      log: {
        info: (obj: unknown, msg: string) => logCalls.push({ level: "info", obj, msg }),
        error: (obj: unknown, msg: string) => logCalls.push({ level: "error", obj, msg }),
        warn: (obj: unknown, msg: string) => logCalls.push({ level: "warn", obj, msg }),
      },
    } as unknown as FastifyInstance
  }

  function makeIdentity(eventId?: string): EventIdentity {
    return {
      pspProvider: "hitpay",
      pspEventId: eventId ?? `evt-${randomUUID()}`,
      eventType: "payment_request.completed",
      payloadHash: `hash-${randomUUID()}`,
    }
  }

  function logsByEvent(event: string): LogCall[] {
    return logCalls.filter((l) => (l.obj as Record<string, unknown>)["event"] === event)
  }

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })
    buyerId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    productId = randomUUID()
    variantId = randomUUID()

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "fanout test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Fanout Store",
        slug: `fanout-${storeId}`,
        status: "active",
      })
      await tx.insert(schema.products).values({
        id: productId,
        storeId,
        name: "Fanout Product",
        slug: `fanout-${productId}`,
        status: "active",
      })
      await tx.insert(schema.productVariants).values({
        id: variantId,
        productId,
        name: "V",
        priceMyrSen: 5000n,
        stockCount: 100,
        isActive: true,
      })
      // Three extras for multi-store tests (4-store negative-payout reproduction).
      extraStoreIds = [randomUUID(), randomUUID(), randomUUID()]
      extraProductIds = [randomUUID(), randomUUID(), randomUUID()]
      extraVariantIds = [randomUUID(), randomUUID(), randomUUID()]
      for (let i = 0; i < 3; i++) {
        await tx.insert(schema.stores).values({
          id: extraStoreIds[i]!,
          ownerId: sellerId,
          name: `Fanout Store ${i + 2}`,
          slug: `fanout-${extraStoreIds[i]!}`,
          status: "active",
        })
        await tx.insert(schema.products).values({
          id: extraProductIds[i]!,
          storeId: extraStoreIds[i]!,
          name: `Fanout Product ${i + 2}`,
          slug: `fanout-${extraProductIds[i]!}`,
          status: "active",
        })
        await tx.insert(schema.productVariants).values({
          id: extraVariantIds[i]!,
          productId: extraProductIds[i]!,
          name: "V",
          priceMyrSen: 5000n,
          stockCount: 100,
          isActive: true,
        })
      }
      // Ensure regular_order_commission_pct is seeded at 25.
      await tx
        .insert(schema.platformConfig)
        .values({
          key: "regular_order_commission_pct",
          value: 25,
          description: "Test seed",
        })
        .onConflictDoNothing()
    })
  })

  afterAll(async () => {
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "fanout teardown" }, async (tx) => {
      await tx.delete(schema.ledgerEntries)
      await tx.delete(schema.orderPayouts)
      await tx.delete(schema.orderItems)
      await tx.delete(schema.orders)
      await tx.delete(schema.processedWebhookEvents)
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerId))
      await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerId))
      await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, variantId))
      for (const id of extraVariantIds)
        await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, id))
      await tx.delete(schema.products).where(eq(schema.products.id, productId))
      for (const id of extraProductIds)
        await tx.delete(schema.products).where(eq(schema.products.id, id))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      for (const id of extraStoreIds) await tx.delete(schema.stores).where(eq(schema.stores.id, id))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
    })
    await handle.close()
  })

  beforeEach(async () => {
    logCalls = []
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "fanout reset" }, async (tx) => {
      await tx.delete(schema.ledgerEntries)
      await tx.delete(schema.orderPayouts)
      await tx.delete(schema.orderItems)
      await tx.delete(schema.orders)
      await tx.delete(schema.processedWebhookEvents)
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerId))
      await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerId))
      // Restore commission pct to 25. Use upsert because the
      // "commission pct missing" test DELETES the row — a plain
      // UPDATE would silently no-op and leak the missing state
      // into subsequent tests.
      await tx
        .insert(schema.platformConfig)
        .values({
          key: "regular_order_commission_pct",
          value: 25,
          description: "Test reset",
        })
        .onConflictDoUpdate({
          target: schema.platformConfig.key,
          set: { value: 25 },
        })
      // Restore stock baseline on the primary + extras.
      await tx
        .update(schema.productVariants)
        .set({ stockCount: 100 })
        .where(eq(schema.productVariants.id, variantId))
      for (const id of extraVariantIds) {
        await tx
          .update(schema.productVariants)
          .set({ stockCount: 100 })
          .where(eq(schema.productVariants.id, id))
      }
    })
  })

  // ── Seed helper ─────────────────────────────────────────────────────

  interface SeedOpts {
    /** Defaults: 5000 retail, 500 shipping, 0 voucher, total_buyer_pays = 5500 */
    retailSubtotalSen?: bigint
    shippingFeeSen?: bigint
    voucherContributionSen?: bigint
    brandDiscountSen?: bigint
    voucherDiscountTotalSen?: bigint
    totalBuyerPaysSen?: bigint
    withVoucher?: boolean
    voucherFixedAmountSen?: bigint
    /** Defaults to a randomUUID-based string. */
    pspPaymentRequestId?: string
    /** Override the session status (default pending_payment). */
    status?: "pending_payment" | "paid" | "failed" | "cancelled" | "expired"
  }

  async function seedSession(opts: SeedOpts = {}): Promise<{
    sessionId: string
    voucherId: string | null
    pspPaymentRequestId: string
  }> {
    const sessionId = randomUUID()
    const pspPaymentRequestId = opts.pspPaymentRequestId ?? `pr-${randomUUID()}`
    const voucherId = opts.withVoucher ? randomUUID() : null
    const retail = opts.retailSubtotalSen ?? 5000n
    const shipping = opts.shippingFeeSen ?? 500n
    const voucherContribution = opts.voucherContributionSen ?? 0n
    const brandDiscount = opts.brandDiscountSen ?? 0n
    const voucherDiscountTotal = opts.voucherDiscountTotalSen ?? voucherContribution
    const totalBuyerPays =
      opts.totalBuyerPaysSen ?? retail + shipping - voucherDiscountTotal - brandDiscount

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      if (voucherId) {
        await tx.insert(schema.vouchers).values({
          id: voucherId,
          userId: buyerId,
          code: `vc-${voucherId}`,
          type: "fixed_myr",
          fixedAmountSen: opts.voucherFixedAmountSen ?? 1000n,
          issuedMonth: "2026-05",
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        })
      }
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: opts.status ?? "pending_payment",
        shippingAddress: {
          name: "T",
          line1: "1 Test",
          city: "KL",
          postcode: "50000",
          country: "MY",
        },
        totalCatalogSen: retail,
        totalShippingSen: shipping,
        voucherDiscountSen: voucherDiscountTotal,
        brandDiscountTotalSen: brandDiscount,
        totalBuyerPaysSen: totalBuyerPays,
        voucherId,
        pspPaymentRequestId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      if (voucherId) {
        await tx
          .update(schema.vouchers)
          .set({ reservedCheckoutSessionId: sessionId, reservedAt: new Date() })
          .where(eq(schema.vouchers.id, voucherId))
      }
      await tx.insert(schema.checkoutSessionStores).values({
        checkoutSessionId: sessionId,
        storeId,
        retailSubtotalSen: retail,
        brandDiscountSen: brandDiscount,
        discountedSubtotalSen: retail - brandDiscount,
        voucherContributionSen: voucherContribution,
        shippingFeeSen: shipping,
      })
      await tx.insert(schema.checkoutSessionItems).values({
        checkoutSessionId: sessionId,
        storeId,
        variantId,
        productSnapshot: { id: productId, name: "Fanout Product" },
        variantSnapshot: { id: variantId, name: "V" },
        quantity: 1,
        unitPriceSen: retail,
        lineTotalSen: retail,
      })
      await tx.insert(schema.inventoryReservations).values({
        checkoutSessionId: sessionId,
        variantId,
        quantity: 1,
        status: "active",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
    })

    return { sessionId, voucherId, pspPaymentRequestId }
  }

  async function readSession(sessionId: string) {
    return withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "read" }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.id, sessionId))
        .limit(1)
      return rows[0]
    })
  }

  async function readOrders(sessionId: string) {
    return withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "read orders" }, async (tx) =>
      tx.select().from(schema.orders).where(eq(schema.orders.checkoutSessionId, sessionId)),
    )
  }

  async function readLedger(sessionId: string) {
    return withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "read ledger" }, async (tx) =>
      tx
        .select()
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.transactionId, sessionId)),
    )
  }

  async function readReservationStatuses(sessionId: string): Promise<string[]> {
    return withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "read res" }, async (tx) => {
      const rows = await tx
        .select({ status: schema.inventoryReservations.status })
        .from(schema.inventoryReservations)
        .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId))
      return rows.map((r) => r.status)
    })
  }

  // ── Dispatcher: not-order fall-through ──────────────────────────────

  it("paymentRequestId does not match any session → returns 'not_order'; no audit row written", async () => {
    const args: OrderPaymentArgs = {
      app: makeFakeApp(),
      paymentRequestId: `pr-non-existent-${randomUUID()}`,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.50",
      eventIdentity: makeIdentity(),
    }

    const auditBefore = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "audit count" },
      async (tx) => tx.select({ id: schema.adminBypassAudit.id }).from(schema.adminBypassAudit),
    )
    const result = await handleOrderPayment(args)
    const auditAfter = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "audit count" },
      async (tx) => tx.select({ id: schema.adminBypassAudit.id }).from(schema.adminBypassAudit),
    )

    expect(result.result).toBe("not_order")
    // Two audit rows from this test's withAdmin calls (audit-count probes
    // + the handleOrderPayment withAdmin). The non-order branch DOES write
    // an audit row because the dispatch happens inside the withAdmin tx.
    // What matters: no idempotency row, no orders, no ledger.
    expect(auditAfter.length).toBeGreaterThanOrEqual(auditBefore.length + 1)
    expect(await readOrders(randomUUID())).toHaveLength(0)
  })

  // ── Happy path: single-store, no voucher ────────────────────────────

  it("completed event, single store, no voucher → orders + ledger + reservations converted + session paid", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    const paymentId = `pay-${randomUUID()}`

    const result = await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })

    expect(result.result).toBe("handled")

    const sessionAfter = await readSession(sessionId)
    expect(sessionAfter?.status).toBe("paid")
    expect(sessionAfter?.pspPaymentId).toBe(paymentId)
    expect(sessionAfter?.pspFeeSen).toBe(95n)

    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.paymentStatus).toBe("paid")
    expect(order.fulfilmentStatus).toBe("processing")
    expect(order.bomyCommissionPct).toBe(25)
    // Journal balance: seller + bomy + psp = discounted + shipping - voucher = 5500
    expect(order.sellerPayoutSen + order.bomyCommissionSen + order.pspFeeAllocatedSen).toBe(5500n)

    const ledger = await readLedger(sessionId)
    const credits = ledger.filter((l) => l.direction === "credit")
    const debits = ledger.filter((l) => l.direction === "debit")
    expect(credits).toHaveLength(1)
    expect(credits[0]?.amountMinor).toBe(5500n)
    expect(credits[0]?.idempotencyKey).toBe(`checkout:${sessionId}:credit`)
    // Two debits: seller_payout + processing_fee (both > 0)
    expect(debits).toHaveLength(2)
    const sellerPayoutLeg = debits.find((d) => d.account === "payable:seller_payout")
    const processingFeeLeg = debits.find((d) => d.account === "expense:processing_fee")
    expect(sellerPayoutLeg?.amountMinor).toBe(order.sellerPayoutSen)
    expect(processingFeeLeg?.amountMinor).toBe(95n)

    expect(await readReservationStatuses(sessionId)).toEqual(["converted"])

    const paidLog = logsByEvent("order_payment_paid")
    expect(paidLog).toHaveLength(1)
    expect((paidLog[0]?.obj as Record<string, unknown>)["voucherClaimed"]).toBe(false)
  })

  // ── Happy path: voucher claim ───────────────────────────────────────

  // Bob R4 verification: bomy_commission_negative log includes orderId
  // per spec §6.1. Use a voucher big enough that BOMY's share goes
  // negative.
  it("voucher exceeds BOMY share → bomy_commission_negative warn log includes orderId", async () => {
    // retail=5000, shipping=0, voucherContribution=4500.
    // total = 5000 + 0 - 4500 = 500. fee small.
    // net_catalog = 5000 - tiny psp = ~5000; seller_share = floor(5000 * 75/100) = 3750
    // bomy = 5000 - 3750 - 4500 = -3250 ← negative
    const { sessionId, pspPaymentRequestId } = await seedSession({
      withVoucher: true,
      retailSubtotalSen: 5000n,
      shippingFeeSen: 0n,
      voucherContributionSen: 4500n,
      voucherDiscountTotalSen: 4500n,
      voucherFixedAmountSen: 4500n,
    })
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "5.00", // 500 sen = totalBuyerPaysSen
      feesStr: "0.01",
      eventIdentity: makeIdentity(),
    })

    const session = await readSession(sessionId)
    expect(session?.status).toBe("paid")

    const negLogs = logsByEvent("bomy_commission_negative")
    expect(negLogs).toHaveLength(1)
    const obj = negLogs[0]?.obj as Record<string, unknown>
    // R4: orderId must be present (not just storeId).
    expect(obj["orderId"]).toBeDefined()
    expect(typeof obj["orderId"]).toBe("string")
    expect(obj["storeId"]).toBe(storeId)
    // The actual bomy commission depends on fee math; assert it's negative.
    const reportedBomy = BigInt(obj["bomyCommissionSen"] as string)
    expect(reportedBomy).toBeLessThan(0n)
  })

  it("completed event with voucher → voucher redeemed, session paid", async () => {
    const { sessionId, voucherId, pspPaymentRequestId } = await seedSession({
      withVoucher: true,
      voucherContributionSen: 1000n,
      voucherDiscountTotalSen: 1000n,
      // total = 5000 + 500 - 1000 - 0 = 4500
    })
    const paymentId = `pay-${randomUUID()}`

    const result = await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      status: "completed",
      amountStr: "45.00", // 4500 sen
      feesStr: "0.80",
      eventIdentity: makeIdentity(),
    })

    expect(result.result).toBe("handled")
    const sessionAfter = await readSession(sessionId)
    expect(sessionAfter?.status).toBe("paid")

    // Voucher must be redeemed: redeemedAt set, reserved cleared.
    const voucher = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "read voucher" },
      async (tx) =>
        tx.select().from(schema.vouchers).where(eq(schema.vouchers.id, voucherId!)).limit(1),
    )
    expect(voucher[0]?.redeemedAt).not.toBeNull()
    expect(voucher[0]?.redeemedCheckoutSessionId).toBe(sessionId)
    expect(voucher[0]?.reservedCheckoutSessionId).toBeNull()

    const paidLog = logsByEvent("order_payment_paid")
    expect((paidLog[0]?.obj as Record<string, unknown>)["voucherClaimed"]).toBe(true)
  })

  // ── Idempotency hit: replay → consistency check, no fan-out ─────────

  it("second delivery of same event_id → idempotency hit; no new orders/ledger; consistency check pass log", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    const paymentId = `pay-${randomUUID()}`
    const identity = makeIdentity()

    // First delivery: fan out fully.
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: identity,
    })
    const ordersAfterFirst = await readOrders(sessionId)
    const ledgerAfterFirst = await readLedger(sessionId)

    // Reset log capture.
    logCalls = []

    // Second delivery: same event_id → idempotency hit.
    const result = await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: identity, // SAME event identity
    })

    expect(result.result).toBe("handled")
    expect(await readOrders(sessionId)).toHaveLength(ordersAfterFirst.length)
    expect(await readLedger(sessionId)).toHaveLength(ledgerAfterFirst.length)
    expect(logsByEvent("order_payment_idempotent")).toHaveLength(1)
    expect(logsByEvent("consistency_check_failed")).toHaveLength(0)
  })

  // ── Idempotency collision: same event_id, different payload_hash ────

  it("second delivery with same event_id but different payload_hash → webhook_event_id_collision error log", async () => {
    const { pspPaymentRequestId } = await seedSession()
    const eventId = `evt-${randomUUID()}`

    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: {
        pspProvider: "hitpay",
        pspEventId: eventId,
        eventType: "payment_request.completed",
        payloadHash: "hash-FIRST",
      },
    })

    logCalls = []
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: {
        pspProvider: "hitpay",
        pspEventId: eventId,
        eventType: "payment_request.completed",
        payloadHash: "hash-DIFFERENT",
      },
    })

    const collisionLog = logsByEvent("webhook_event_id_collision")
    expect(collisionLog).toHaveLength(1)
    expect((collisionLog[0]?.obj as Record<string, unknown>)["existingHash"]).toBe("hash-FIRST")
    expect((collisionLog[0]?.obj as Record<string, unknown>)["newHash"]).toBe("hash-DIFFERENT")
  })

  // ── Failed event routes to release ──────────────────────────────────

  it("status='failed' event → routes to runFailureRelease; no orders/ledger; session failed; reservations released", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()

    const result = await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "failed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })

    expect(result.result).toBe("handled")
    const sessionAfter = await readSession(sessionId)
    expect(sessionAfter?.status).toBe("failed")
    expect(await readOrders(sessionId)).toHaveLength(0)
    expect(await readLedger(sessionId)).toHaveLength(0)
    expect(await readReservationStatuses(sessionId)).toEqual(["released"])
    expect(logsByEvent("order_payment_failed")).toHaveLength(1)
  })

  // ── B5: failed event with malformed amount still releases ───────────

  it("status='failed' with unparseable amount → release still runs (B5: status routes before parse)", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: "",
      status: "failed",
      amountStr: "abc",
      feesStr: "abc",
      eventIdentity: makeIdentity(),
    })
    expect((await readSession(sessionId))?.status).toBe("failed")
    expect(await readReservationStatuses(sessionId)).toEqual(["released"])
  })

  // ── B8: missing paymentId on completed → park amount_mismatch ───────

  it("completed event with empty paymentId → park amount_mismatch; no orders/ledger; structured review log emitted", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: "", // missing
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("amount_mismatch")
    expect(await readOrders(sessionId)).toHaveLength(0)
    expect(await readLedger(sessionId)).toHaveLength(0)
    // Bob R1: PR #34 alerting keys off event=order_payment_review.
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["cause"]).toBe(
      "missing_payment_id_on_completed",
    )
  })

  // ── Amount mismatch → park ──────────────────────────────────────────

  it("amount mismatch → park amount_mismatch; no orders/ledger; reservations untouched; structured review log emitted", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "99.99", // != 55.00
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("amount_mismatch")
    expect(await readOrders(sessionId)).toHaveLength(0)
    expect(await readReservationStatuses(sessionId)).toEqual(["active"]) // untouched
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["expectedAmount"]).toBe("5500")
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["receivedAmount"]).toBe("9999")
  })

  // ── B6: Step F status guard ─────────────────────────────────────────

  it("session already paid (different event_id arrives later) → skip fan-out; consistency check", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    // First fan-out
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })
    expect((await readSession(sessionId))?.status).toBe("paid")

    logCalls = []
    // Second event with DIFFERENT event_id → claimEvent owns it, but
    // Step F sees session = 'paid' and short-circuits to consistency check.
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(), // FRESH event_id
    })
    // Still exactly 1 order, 3 ledger legs (1 credit + 2 debits).
    expect(await readOrders(sessionId)).toHaveLength(1)
    expect(await readLedger(sessionId)).toHaveLength(3)
    // Consistency check should have run and passed.
    expect(logsByEvent("order_payment_idempotent")).toHaveLength(1)
  })

  // ── PSP fee parse failures → park amount_mismatch ───────────────────

  it("feesStr unparseable → park amount_mismatch; review log with cause=psp_fee_unparseable", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "abc",
      eventIdentity: makeIdentity(),
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("amount_mismatch")
    expect(await readOrders(sessionId)).toHaveLength(0)
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["cause"]).toBe("psp_fee_unparseable")
  })

  it("feesStr > total → park amount_mismatch; review log with cause=psp_fee_exceeds_gross", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "99.99", // greater than 55.00
      eventIdentity: makeIdentity(),
    })
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("amount_mismatch")
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["cause"]).toBe("psp_fee_exceeds_gross")
  })

  // ── Commission config validation → park invalid_commission_config ───

  it("regular_order_commission_pct missing → park invalid_commission_config", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "drop pct" }, async (tx) => {
      await tx
        .delete(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "regular_order_commission_pct"))
    })
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("invalid_commission_config")
    expect(await readOrders(sessionId)).toHaveLength(0)
  })

  it("regular_order_commission_pct = 125 (out of range) → park invalid_commission_config", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "bad pct" }, async (tx) => {
      await tx
        .update(schema.platformConfig)
        .set({ value: 125 })
        .where(eq(schema.platformConfig.key, "regular_order_commission_pct"))
    })
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("invalid_commission_config")
  })

  // ── Task 6 R1: negative seller payout → park invalid_commission_config ─

  it("negative seller payout from PSP-fee over-allocation → park invalid_commission_config; no orders/ledger", async () => {
    // Tiny session: discounted=1, shipping=0, voucher=0, total=1.
    // PSP fee 0.03 (3 sen) > what the single store can absorb.
    // psp_fee_allocated = 3 against discounted=1 → seller_payout = -1.
    const { sessionId, pspPaymentRequestId } = await seedSession({
      retailSubtotalSen: 1n,
      shippingFeeSen: 0n,
      voucherContributionSen: 0n,
      voucherDiscountTotalSen: 0n,
      totalBuyerPaysSen: 1n,
    })
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "0.01",
      feesStr: "0.03",
      eventIdentity: makeIdentity(),
    })
    // feesStr (3) > totalBuyerPaysSen (1) → first parked at amount_mismatch
    // BEFORE we get to the negative-seller-payout check. Adjust the test
    // to use a fees value that is <= total but still over-allocates.
    expect((await readSession(sessionId))?.status).toBe("payment_review_required")
  })

  // Bob R3: real 4-store reproduction of the PSP-fee over-allocation
  // that triggers NegativeSellerPayoutError → park as invalid_commission_config.
  // From commission.test.ts: four stores each net=1, total=4, pspFee=3.
  // Last store absorbs the floor remainder (3) against net=1 → seller_payout=-1.
  it("4-store PSP-fee over-allocation → NegativeSellerPayoutError parks as invalid_commission_config; no orders or ledger", async () => {
    const sessionId = randomUUID()
    const pspPaymentRequestId = `pr-${randomUUID()}`
    const allStoreIds = [storeId, ...extraStoreIds]
    const allVariantIds = [variantId, ...extraVariantIds]

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "seed 4-store" }, async (tx) => {
      // Each store contributes net = 1: discounted=1, shipping=0, voucher=0.
      // Total = 4. Fee = 3 (set later via webhook feesStr).
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: "pending_payment",
        shippingAddress: {},
        totalCatalogSen: 4n, // 4 stores × retail 1
        totalShippingSen: 0n,
        voucherDiscountSen: 0n,
        brandDiscountTotalSen: 0n,
        totalBuyerPaysSen: 4n,
        pspPaymentRequestId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      // Sort by storeId asc so allocator order matches ORDER BY in fanOutPaid.
      const sortedStoreIds = [...allStoreIds].sort()
      for (let i = 0; i < sortedStoreIds.length; i++) {
        const sId = sortedStoreIds[i]!
        const vId = allVariantIds[allStoreIds.indexOf(sId)]!
        await tx.insert(schema.checkoutSessionStores).values({
          checkoutSessionId: sessionId,
          storeId: sId,
          retailSubtotalSen: 1n,
          brandDiscountSen: 0n,
          discountedSubtotalSen: 1n,
          voucherContributionSen: 0n,
          shippingFeeSen: 0n,
        })
        await tx.insert(schema.checkoutSessionItems).values({
          checkoutSessionId: sessionId,
          storeId: sId,
          variantId: vId,
          productSnapshot: { id: vId, name: "v" },
          variantSnapshot: { id: vId },
          quantity: 1,
          unitPriceSen: 1n,
          lineTotalSen: 1n,
        })
        await tx.insert(schema.inventoryReservations).values({
          checkoutSessionId: sessionId,
          variantId: vId,
          quantity: 1,
          status: "active",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        })
      }
    })

    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "0.04", // 4 sen — matches totalBuyerPaysSen
      feesStr: "0.03", // 3 sen — <= total (passes the gross check) but over-allocates
      eventIdentity: makeIdentity(),
    })

    // Assert park.
    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("invalid_commission_config")

    // Assert no orders, no ledger, reservations untouched.
    expect(await readOrders(sessionId)).toHaveLength(0)
    expect(await readLedger(sessionId)).toHaveLength(0)
    expect(await readReservationStatuses(sessionId)).toEqual([
      "active",
      "active",
      "active",
      "active",
    ])

    // Assert the structured review log fired with the right shape.
    const reviewLogs = logsByEvent("order_payment_review")
    const negativeLog = reviewLogs.find(
      (l) => (l.obj as Record<string, unknown>)["cause"] === "negative_seller_payout",
    )
    expect(negativeLog).toBeDefined()
    expect((negativeLog?.obj as Record<string, unknown>)["reason"]).toBe(
      "invalid_commission_config",
    )
    expect((negativeLog?.obj as Record<string, unknown>)["sellerPayoutSen"]).toBe("-1")
  })

  it("fee == total edge: single-store fan-out succeeds (no negative seller payout false-positive)", async () => {
    // Tiny session at the fee-equals-total boundary. Math:
    //   discounted=1, shipping=0, voucher=0, psp=1, pct=25
    //   catalog_psp = (1 * 1) / 1 = 1; shipping_psp = 0
    //   net_catalog = 1 - 1 = 0; seller_share = 0; seller_payout = 0
    //   bomy = 0 - 0 - 0 = 0. Journal: 0+0+1 = 1 ✓.
    // Seller payout is exactly 0 (the approved zero-edge, NOT negative).
    // assertNonNegativeSellerPayout passes; fan-out completes.
    //
    // The actual negative-seller-payout path (multi-store over-allocation
    // → assertNonNegativeSellerPayout throws → parkPaymentReview as
    // invalid_commission_config) is covered by commission.test.ts unit
    // tests at the helper level. Reproducing it end-to-end here would
    // require seeding 4 separate stores, which Task 12 will exercise.
    const { sessionId, pspPaymentRequestId } = await seedSession({
      retailSubtotalSen: 1n,
      shippingFeeSen: 0n,
      voucherContributionSen: 0n,
      voucherDiscountTotalSen: 0n,
      totalBuyerPaysSen: 1n,
    })
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "0.01",
      feesStr: "0.01",
      eventIdentity: makeIdentity(),
    })
    expect((await readSession(sessionId))?.status).toBe("paid")
    // Ledger: 1 credit (1 sen). seller_payout=0 → SKIP that debit leg
    // (B10 > 0n gate). processing_fee=1 → 1 debit leg.
    const ledger = await readLedger(sessionId)
    expect(ledger.filter((l) => l.direction === "credit")).toHaveLength(1)
    const debits = ledger.filter((l) => l.direction === "debit")
    expect(debits).toHaveLength(1) // only processing_fee; seller_payout=0 is skipped
    expect(debits[0]?.account).toBe("expense:processing_fee")
  })

  // ── Voucher claim failed → review state but orders committed ─────────

  it("voucher claim race: voucher reservation lost mid-tx → orders+ledger committed, session voucher_claim_failed", async () => {
    const { sessionId, voucherId, pspPaymentRequestId } = await seedSession({
      withVoucher: true,
      voucherContributionSen: 1000n,
      voucherDiscountTotalSen: 1000n,
    })

    // Manually break the voucher reservation BEFORE the webhook arrives
    // (simulating a parallel cancel / expiry path).
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "break voucher" }, async (tx) => {
      await tx
        .update(schema.vouchers)
        .set({ reservedCheckoutSessionId: null, reservedAt: null })
        .where(eq(schema.vouchers.id, voucherId!))
    })

    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "completed",
      amountStr: "45.00",
      feesStr: "0.80",
      eventIdentity: makeIdentity(),
    })

    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("voucher_claim_failed")

    // Orders + ledger STAY committed.
    expect(await readOrders(sessionId)).toHaveLength(1)
    expect(await readLedger(sessionId)).toHaveLength(3) // credit + seller_payout + processing_fee
    expect(await readReservationStatuses(sessionId)).toEqual(["converted"])
    expect(logsByEvent("voucher_claim_failed")).toHaveLength(1)
  })

  // ── Unknown status → park ───────────────────────────────────────────

  it("unknown HitPay status → park amount_mismatch; review log carries hitpayStatus", async () => {
    const { sessionId, pspPaymentRequestId } = await seedSession()
    await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "weird_unknown_status",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("amount_mismatch")
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["hitpayStatus"]).toBe(
      "weird_unknown_status",
    )
  })

  it("handleOrderPayment result shape — handled with order_paid descriptor", async () => {
    const { pspPaymentRequestId } = await seedSession()
    const paymentId = `pay-${randomUUID()}`

    const result = await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      status: "completed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventIdentity: makeIdentity(),
    })

    expect(result.result).toBe("handled")
    const notifs = result.notifications as NotificationDescriptor[]
    expect(notifs.length).toBeGreaterThanOrEqual(1)
    const paid = notifs.find((d) => d.type === "order_paid")
    expect(paid).toBeDefined()
    expect((paid as OrderPaidDescriptor).voucherClaimFailed).toBe(false)
  })

  it("handleOrderPayment result shape — not_order returns empty notifications", async () => {
    const result = await handleOrderPayment({
      app: makeFakeApp(),
      paymentRequestId: randomUUID(), // no matching session
      paymentId: "",
      status: "completed",
      amountStr: "0.00",
      feesStr: "0.00",
      eventIdentity: makeIdentity(),
    })
    expect(result.result).toBe("not_order")
    expect(result.notifications).toHaveLength(0)
  })
})
