/**
 * Full end-to-end integration tests for POST /webhooks/hitpay on the
 * order-payment branch (PR #32 Task 12; spec §7.2 tests 14–35).
 *
 * Real Postgres, real HMAC signing, real fastify route — no
 * handleOrderPayment direct calls (those live in order-fanout.test.ts).
 * The route plugin reads HITPAY_SALT at registration time, so the env
 * var MUST be set BEFORE createApp().
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/api test hitpay-order.test.ts --run
 */
import { createHmac, randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { runInventoryReservationExpiryJob } from "../../src/jobs/inventory-reservation-expiry.js"
import { createApp } from "../../src/server.js"
import { nextTestClientIp } from "../helpers/client-ip.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const TEST_SALT = "test-webhook-salt"

function sign(rawBody: string): string {
  return createHmac("sha256", TEST_SALT).update(rawBody).digest("hex")
}

describe.skipIf(!shouldRun)("POST /webhooks/hitpay — order-payment integration", () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let setupDb: ReturnType<typeof makeDb>
  // Second pool used only by the SKIP LOCKED race test (test 31) so the
  // locker tx and the probe tx are guaranteed to land on different
  // physical connections regardless of pool size.
  let lockDb: ReturnType<typeof makeDb>

  // Shared per-suite seed (4 stores so multi-store tests reuse fixtures
  // without per-test seller/store creation).
  let buyerId: string
  let sellerId: string
  let storeIds: string[]
  let variantIds: string[]
  let productIds: string[]
  // For test 35 (seller buys from own store).
  let buyerSellerId: string
  let buyerSellerStoreId: string
  let buyerSellerVariantId: string
  let buyerSellerProductId: string

  // ── Log capture ───────────────────────────────────────────────────────
  // The order-payment handlers log via `args.app.log.X(obj, msg)` on the
  // parent Fastify pino instance. Monkey-patch the three levels we care
  // about so each test can assert on structured `event:` payloads.

  type LogCall = { level: "info" | "warn" | "error"; obj: Record<string, unknown>; msg: string }
  let logCalls: LogCall[] = []

  function logsByEvent(event: string): LogCall[] {
    return logCalls.filter((l) => l.obj["event"] === event)
  }

  beforeAll(async () => {
    process.env["HITPAY_SALT"] = TEST_SALT
    setupDb = makeDb({ url: DATABASE_URL as string })
    lockDb = makeDb({ url: DATABASE_URL as string })
    app = await createApp()
    await app.ready()

    // Intercept app.log so tests can assert on structured events without
    // running a custom transport. The wrappers also forward to the
    // original logger so failures still surface in pino-pretty output.
    for (const level of ["info", "warn", "error"] as const) {
      const orig = (app.log[level] as (...a: unknown[]) => void).bind(app.log)
      ;(app.log as unknown as Record<string, unknown>)[level] = (...a: unknown[]) => {
        const first = a[0]
        const second = a[1]
        if (first && typeof first === "object") {
          logCalls.push({
            level,
            obj: first as Record<string, unknown>,
            msg: typeof second === "string" ? second : "",
          })
        } else {
          logCalls.push({
            level,
            obj: {},
            msg: typeof first === "string" ? first : "",
          })
        }
        return orig(...a)
      }
    }

    buyerId = randomUUID()
    storeIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort()
    variantIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    buyerSellerId = randomUUID()
    buyerSellerStoreId = randomUUID()
    buyerSellerVariantId = randomUUID()
    sellerId = randomUUID()
    productIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    buyerSellerProductId = randomUUID()

    await withAdmin(
      setupDb.db,
      { userId: SYSTEM_ACTOR, reason: "hitpay-order seed" },
      async (tx) => {
        await tx.insert(schema.users).values([
          { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
          { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
          { id: buyerSellerId, email: `${buyerSellerId}@test.bomy`, role: "seller_owner" },
        ])
        for (let i = 0; i < 4; i++) {
          await tx.insert(schema.stores).values({
            id: storeIds[i]!,
            ownerId: sellerId,
            name: `Hitpay Order Store ${i + 1}`,
            slug: `hitpay-order-${storeIds[i]!}`,
            status: "active",
          })
          await tx.insert(schema.products).values({
            id: productIds[i]!,
            storeId: storeIds[i]!,
            name: `Hitpay Order Product ${i + 1}`,
            slug: `hitpay-order-${productIds[i]!}`,
            status: "active",
          })
          await tx.insert(schema.productVariants).values({
            id: variantIds[i]!,
            productId: productIds[i]!,
            name: "V",
            priceMyrSen: 5000n,
            stockCount: 100,
            isActive: true,
          })
        }
        await tx.insert(schema.stores).values({
          id: buyerSellerStoreId,
          ownerId: buyerSellerId,
          name: "Hitpay Self Store",
          slug: `hitpay-self-${buyerSellerStoreId}`,
          status: "active",
        })
        await tx.insert(schema.products).values({
          id: buyerSellerProductId,
          storeId: buyerSellerStoreId,
          name: "Hitpay Self Product",
          slug: `hitpay-self-${buyerSellerProductId}`,
          status: "active",
        })
        await tx.insert(schema.productVariants).values({
          id: buyerSellerVariantId,
          productId: buyerSellerProductId,
          name: "V",
          priceMyrSen: 5000n,
          stockCount: 100,
          isActive: true,
        })
        await tx
          .insert(schema.platformConfig)
          .values({
            key: "regular_order_commission_pct",
            value: 25,
            description: "Test seed",
          })
          .onConflictDoNothing()
      },
    )
  })

  afterAll(async () => {
    // Broad clean-slate teardown. The DB is test-only; mirroring the
    // exact set of rows we created risks leaking residue when a prior
    // test crashed before its beforeEach reset could fire.
    await withAdmin(
      setupDb.db,
      { userId: SYSTEM_ACTOR, reason: "hitpay-order teardown" },
      async (tx) => {
        await tx.delete(schema.ledgerEntries)
        await tx.delete(schema.orderPayouts)
        await tx.delete(schema.orderItems)
        await tx.delete(schema.orders)
        await tx.delete(schema.processedWebhookEvents)
        await tx.delete(schema.inventoryReservations)
        await tx.delete(schema.checkoutSessionItems)
        await tx.delete(schema.checkoutSessionStores)
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerId))
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerSellerId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerId))
        await tx
          .delete(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.userId, buyerSellerId))
        for (const id of variantIds)
          await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, id))
        await tx
          .delete(schema.productVariants)
          .where(eq(schema.productVariants.id, buyerSellerVariantId))
        for (const id of productIds)
          await tx.delete(schema.products).where(eq(schema.products.id, id))
        await tx.delete(schema.products).where(eq(schema.products.id, buyerSellerProductId))
        for (const id of storeIds) await tx.delete(schema.stores).where(eq(schema.stores.id, id))
        await tx.delete(schema.stores).where(eq(schema.stores.id, buyerSellerStoreId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerSellerId))
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
      },
    )
    await app.close()
    await setupDb.close()
    await lockDb.close()
  })

  beforeEach(async () => {
    logCalls = []
    await withAdmin(
      setupDb.db,
      { userId: SYSTEM_ACTOR, reason: "hitpay-order reset" },
      async (tx) => {
        await tx.delete(schema.ledgerEntries)
        await tx.delete(schema.orderPayouts)
        await tx.delete(schema.orderItems)
        await tx.delete(schema.orders)
        await tx.delete(schema.processedWebhookEvents)
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerId))
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerSellerId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerId))
        await tx
          .delete(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.userId, buyerSellerId))
        // Tests 23–25 DELETE the commission row; a plain UPDATE here would
        // silently no-op and leak the missing state. Upsert restores it.
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
        for (const id of variantIds) {
          await tx
            .update(schema.productVariants)
            .set({ stockCount: 100 })
            .where(eq(schema.productVariants.id, id))
        }
        await tx
          .update(schema.productVariants)
          .set({ stockCount: 100 })
          .where(eq(schema.productVariants.id, buyerSellerVariantId))
      },
    )
  })

  // ── Seed helper ───────────────────────────────────────────────────────

  interface SeedOpts {
    /** Defaults to a fresh UUID-based string. */
    pspPaymentRequestId?: string
    /** Override the user owning the session (default = buyerId). */
    buyerOverrideId?: string
    /** Override the session status (default pending_payment). */
    status?:
      | "pending_payment"
      | "paid"
      | "failed"
      | "cancelled"
      | "expired"
      | "payment_review_required"
    /** Defaults: retail=5000, shipping=500 per store → totalBuyerPays=5500. */
    storeIndexes?: number[] // indexes into storeIds[] / variantIds[]; default [0]
    /** Override per-store amounts. Length must match storeIndexes. */
    storeRetailSen?: bigint[]
    /** Override per-store shipping. Length must match storeIndexes. */
    storeShippingSen?: bigint[]
    /** Override per-store brand discount. Length must match storeIndexes. */
    storeBrandDiscountSen?: bigint[]
    /** Override per-store voucher contribution. Length must match storeIndexes. */
    storeVoucherContributionSen?: bigint[]
    /** Adds a voucher reserved against the session. */
    withVoucher?: boolean
    voucherFixedAmountSen?: bigint
    /**
     * Total voucher discount on the session. If unset and withVoucher,
     * defaults to sum of storeVoucherContributionSen.
     */
    voucherDiscountTotalSen?: bigint
    /** Override the buyer-pays total. Otherwise derived. */
    totalBuyerPaysSen?: bigint
    /** Use the buyerSellerStoreId/Variant (test 35). */
    useBuyerSellerStore?: boolean
    /**
     * Override inventory_reservations.expires_at. Use a past date when
     * a test needs the reservation to qualify as an expiry-job candidate
     * (the job filters r.expires_at < now() - interval '5 minutes').
     */
    reservationExpiresAt?: Date
  }

  interface SeedResult {
    sessionId: string
    pspPaymentRequestId: string
    voucherId: string | null
    storeIds: string[]
    variantIds: string[]
  }

  async function seedFullSession(opts: SeedOpts = {}): Promise<SeedResult> {
    const sessionId = randomUUID()
    const pspPaymentRequestId = opts.pspPaymentRequestId ?? `pr-${randomUUID()}`
    const userId = opts.buyerOverrideId ?? buyerId
    const idxs = opts.storeIndexes ?? [0]
    const useSelf = opts.useBuyerSellerStore === true

    const perStoreRetail = opts.storeRetailSen ?? idxs.map(() => 5000n)
    const perStoreShipping = opts.storeShippingSen ?? idxs.map(() => 500n)
    const perStoreBrand = opts.storeBrandDiscountSen ?? idxs.map(() => 0n)
    const perStoreVoucher = opts.storeVoucherContributionSen ?? idxs.map(() => 0n)

    const totalRetail = perStoreRetail.reduce((a, b) => a + b, 0n)
    const totalShipping = perStoreShipping.reduce((a, b) => a + b, 0n)
    const totalBrand = perStoreBrand.reduce((a, b) => a + b, 0n)
    const totalVoucher = perStoreVoucher.reduce((a, b) => a + b, 0n)
    const voucherDiscountTotal = opts.voucherDiscountTotalSen ?? totalVoucher
    const totalBuyerPays =
      opts.totalBuyerPaysSen ?? totalRetail + totalShipping - voucherDiscountTotal - totalBrand

    const voucherId = opts.withVoucher ? randomUUID() : null
    const resolvedStoreIds = useSelf ? [buyerSellerStoreId] : idxs.map((i) => storeIds[i]!)
    const resolvedVariantIds = useSelf ? [buyerSellerVariantId] : idxs.map((i) => variantIds[i]!)

    await withAdmin(
      setupDb.db,
      { userId: SYSTEM_ACTOR, reason: "hitpay-order seed session" },
      async (tx) => {
        if (voucherId) {
          await tx.insert(schema.vouchers).values({
            id: voucherId,
            userId,
            code: `vc-${voucherId}`,
            type: "fixed_myr",
            fixedAmountSen: opts.voucherFixedAmountSen ?? 1000n,
            issuedMonth: "2026-05",
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          })
        }
        await tx.insert(schema.checkoutSessions).values({
          id: sessionId,
          userId,
          status: opts.status ?? "pending_payment",
          shippingAddress: {
            name: "T",
            line1: "1 Test",
            city: "KL",
            postcode: "50000",
            country: "MY",
          },
          totalCatalogSen: totalRetail,
          totalShippingSen: totalShipping,
          voucherDiscountSen: voucherDiscountTotal,
          brandDiscountTotalSen: totalBrand,
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
        for (let i = 0; i < idxs.length; i++) {
          const sId = resolvedStoreIds[i]!
          const vId = resolvedVariantIds[i]!
          const retail = perStoreRetail[i]!
          const shipping = perStoreShipping[i]!
          const brand = perStoreBrand[i]!
          const vouch = perStoreVoucher[i]!
          await tx.insert(schema.checkoutSessionStores).values({
            checkoutSessionId: sessionId,
            storeId: sId,
            retailSubtotalSen: retail,
            brandDiscountSen: brand,
            discountedSubtotalSen: retail - brand,
            voucherContributionSen: vouch,
            shippingFeeSen: shipping,
          })
          await tx.insert(schema.checkoutSessionItems).values({
            checkoutSessionId: sessionId,
            storeId: sId,
            variantId: vId,
            productSnapshot: { id: vId, name: "Hitpay Order Product" },
            variantSnapshot: { id: vId, name: "V" },
            quantity: 1,
            unitPriceSen: retail,
            lineTotalSen: retail,
          })
          await tx.insert(schema.inventoryReservations).values({
            checkoutSessionId: sessionId,
            variantId: vId,
            quantity: 1,
            status: "active",
            expiresAt: opts.reservationExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
          })
        }
      },
    )

    return {
      sessionId,
      pspPaymentRequestId,
      voucherId,
      storeIds: resolvedStoreIds,
      variantIds: resolvedVariantIds,
    }
  }

  // ── Inject helpers ────────────────────────────────────────────────────

  interface InjectOpts {
    paymentRequestId: string
    paymentId?: string
    status?: string
    amountStr?: string
    feesStr?: string
    eventId?: string
    eventType?: string
    /**
     * Override the raw body (rare — for collision tests where body must
     * be byte-identical). If set, the other body fields are ignored.
     */
    rawBodyOverride?: string
  }

  function buildBody(opts: InjectOpts): string {
    if (opts.rawBodyOverride !== undefined) return opts.rawBodyOverride
    return JSON.stringify({
      payment_request_id: opts.paymentRequestId,
      payment_id: opts.paymentId ?? "",
      status: opts.status ?? "completed",
      amount: opts.amountStr ?? "55.00",
      fees: opts.feesStr ?? "0.95",
    })
  }

  async function injectOrder(opts: InjectOpts) {
    const body = buildBody(opts)
    return app.inject({
      method: "POST",
      url: "/webhooks/hitpay",
      headers: {
        "content-type": "application/json",
        "hitpay-signature": sign(body),
        "hitpay-event-type": opts.eventType ?? "payment_request.completed",
        "x-forwarded-for": nextTestClientIp(),
        ...(opts.eventId !== undefined ? { "hitpay-event-id": opts.eventId } : {}),
      },
      body,
    })
  }

  // ── Read helpers ──────────────────────────────────────────────────────

  async function readSession(sessionId: string) {
    return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "read" }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.id, sessionId))
        .limit(1)
      return rows[0]
    })
  }

  async function readOrders(sessionId: string) {
    return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "read orders" }, async (tx) =>
      tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.checkoutSessionId, sessionId))
        .orderBy(schema.orders.storeId),
    )
  }

  async function readLedger(sessionId: string) {
    return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "read ledger" }, async (tx) =>
      tx
        .select()
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.transactionId, sessionId)),
    )
  }

  async function readReservationStatuses(sessionId: string): Promise<string[]> {
    return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "read res" }, async (tx) => {
      const rows = await tx
        .select({ status: schema.inventoryReservations.status })
        .from(schema.inventoryReservations)
        .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId))
      return rows.map((r) => r.status)
    })
  }

  async function readStock(variantId: string): Promise<number> {
    return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "read stock" }, async (tx) => {
      const rows = await tx
        .select({ stockCount: schema.productVariants.stockCount })
        .from(schema.productVariants)
        .where(eq(schema.productVariants.id, variantId))
        .limit(1)
      return rows[0]?.stockCount ?? -1
    })
  }

  async function readVoucher(voucherId: string) {
    return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "read voucher" }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.vouchers)
        .where(eq(schema.vouchers.id, voucherId))
        .limit(1)
      return rows[0]
    })
  }

  // Audit rows are written inside the withAdmin tx that handleOrderPayment
  // opens (apps/api/src/webhooks/hitpay/order-fanout.ts:78), with reason
  // `hitpay webhook: order payment ${pspEventId}`. Look up by exact
  // reason so the test asserts the audit row that actually corresponds
  // to the duplicate fan-out attempt (not just any row mentioning a
  // session id, which would also match every read helper above).
  async function countAdminBypassAuditByReason(reason: string): Promise<number> {
    return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "audit count" }, async (tx) => {
      const rows = await tx
        .select({ id: schema.adminBypassAudit.id })
        .from(schema.adminBypassAudit)
        .where(eq(schema.adminBypassAudit.reason, reason))
      return rows.length
    })
  }

  // ── Tests 14–16d: idempotency + collisions ──────────────────────────

  it("14 — twin payment_request.completed (same Hitpay-Event-Id) → second is no-op", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    const eventId = `evt-${randomUUID()}`
    const paymentId = `pay-${randomUUID()}`

    const r1 = await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
    })
    expect(r1.statusCode).toBe(200)
    const ordersAfter1 = await readOrders(sessionId)
    const ledgerAfter1 = await readLedger(sessionId)
    expect(ordersAfter1).toHaveLength(1)
    expect(ledgerAfter1.filter((l) => l.direction === "credit")).toHaveLength(1)

    logCalls = []
    const r2 = await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
    })
    expect(r2.statusCode).toBe(200)
    expect(await readOrders(sessionId)).toHaveLength(ordersAfter1.length)
    expect(await readLedger(sessionId)).toHaveLength(ledgerAfter1.length)
    // Second delivery hits idempotency (collision check + consistency
    // audit). No error-level review logs, no duplicate fan-out log.
    expect(logsByEvent("webhook_duplicate_fanout_blocked")).toHaveLength(0)
    expect(logsByEvent("order_payment_review")).toHaveLength(0)
  })

  it("15 — replay runs consistency check and passes; consistency_check_failed never logs", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    const eventId = `evt-${randomUUID()}`
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
    })
    logCalls = []
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
    })
    expect(logsByEvent("consistency_check_failed")).toHaveLength(0)
    expect(logsByEvent("order_payment_idempotent")).toHaveLength(1)
    expect((await readSession(sessionId))?.status).toBe("paid")
  })

  it("16 — replay on voucher_claim_failed session: orders+ledger present; voucher unclaimed; consistency pass", async () => {
    const { sessionId, pspPaymentRequestId, voucherId } = await seedFullSession({
      withVoucher: true,
      storeVoucherContributionSen: [1000n],
      // total = 5000 + 500 - 1000 = 4500
    })

    // Break the voucher reservation BEFORE the first inject so the
    // voucher claim UPDATE returns 0 rows → session parks at
    // voucher_claim_failed but orders + ledger still commit.
    await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "break voucher" }, async (tx) => {
      await tx
        .update(schema.vouchers)
        .set({ reservedCheckoutSessionId: null, reservedAt: null })
        .where(eq(schema.vouchers.id, voucherId!))
    })

    const eventId = `evt-${randomUUID()}`
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "45.00",
      feesStr: "0.80",
      eventId,
    })
    expect((await readSession(sessionId))?.status).toBe("payment_review_required")
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("voucher_claim_failed")
    expect(await readOrders(sessionId)).toHaveLength(1)
    expect(await readLedger(sessionId)).not.toHaveLength(0)

    logCalls = []
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "45.00",
      feesStr: "0.80",
      eventId,
    })
    // Replay with same event_id → idempotency hit → consistency check
    // on the voucher_claim_failed session passes (orders + credit +
    // reservations all match), so no error.
    expect(logsByEvent("consistency_check_failed")).toHaveLength(0)
    expect(logsByEvent("order_payment_idempotent")).toHaveLength(1)
    // Voucher still unclaimed.
    const v = await readVoucher(voucherId!)
    expect(v?.redeemedAt).toBeNull()
    expect(v?.redeemedCheckoutSessionId).toBeNull()
  })

  it("16a — same event_id, different payload_hash → webhook_event_id_collision error", async () => {
    const { pspPaymentRequestId } = await seedFullSession()
    const eventId = `evt-${randomUUID()}`

    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-FIRST`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
    })

    logCalls = []
    // Different payment_id → different raw body → different payloadHash.
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-SECOND-different`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
    })

    const collisionLogs = logsByEvent("webhook_event_id_collision")
    expect(collisionLogs).toHaveLength(1)
    expect((collisionLogs[0]?.obj as Record<string, unknown>)["existingHash"]).toBeDefined()
    expect((collisionLogs[0]?.obj as Record<string, unknown>)["newHash"]).toBeDefined()
    expect((collisionLogs[0]?.obj as Record<string, unknown>)["existingHash"]).not.toBe(
      (collisionLogs[0]?.obj as Record<string, unknown>)["newHash"],
    )
  })

  it("16b — same event_id, same body, different event_type header → collision", async () => {
    const { pspPaymentRequestId } = await seedFullSession()
    const eventId = `evt-${randomUUID()}`
    const paymentId = `pay-${randomUUID()}`

    // First delivery: payment_request.completed
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
      eventType: "payment_request.completed",
    })
    logCalls = []
    // Second delivery: identical body+signature; only event-type header
    // changes. claimEvent at Step A still runs → conflict → collision
    // check fires before Step D (failed routing) is reached.
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId,
      eventType: "payment_request.failed",
    })

    const collisionLogs = logsByEvent("webhook_event_id_collision")
    expect(collisionLogs).toHaveLength(1)
    expect((collisionLogs[0]?.obj as Record<string, unknown>)["existingType"]).toBe(
      "payment_request.completed",
    )
    expect((collisionLogs[0]?.obj as Record<string, unknown>)["newType"]).toBe(
      "payment_request.failed",
    )
  })

  it("16c — different event_ids on same payment_request_id → second short-circuits at Step F", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()

    // First delivery fans out fully.
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    const ordersAfter1 = await readOrders(sessionId)
    const ledgerAfter1 = await readLedger(sessionId)
    expect(ordersAfter1).toHaveLength(1)

    logCalls = []
    // Second delivery: fresh event_id (claims a new processed_webhook_events
    // row), but Step F sees session.status='paid' and short-circuits to
    // the consistency check. Exactly one set of orders + ledger remains.
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect(await readOrders(sessionId)).toHaveLength(ordersAfter1.length)
    expect(await readLedger(sessionId)).toHaveLength(ledgerAfter1.length)
  })

  it("16d — belt-and-braces: bypass Step F → ON CONFLICT DO NOTHING fires webhook_duplicate_fanout_blocked", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()

    // First delivery: normal fan-out.
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    const ordersAfter1 = await readOrders(sessionId)
    expect(ordersAfter1).toHaveLength(1)
    const firstOrderId = ordersAfter1[0]!.id

    // Force the Step-F guard bypass: reset the session back to
    // pending_payment via a side-channel withAdmin write. A second
    // delivery now passes Step F → reaches fanOutPaid → INSERT order
    // hits the (checkout_session_id, store_id) unique conflict →
    // 0 rows returned → emit `webhook_duplicate_fanout_blocked`
    // (B7: commit, do not throw, so the audit row persists).
    await withAdmin(
      setupDb.db,
      { userId: SYSTEM_ACTOR, reason: "force step-F bypass" },
      async (tx) => {
        await tx
          .update(schema.checkoutSessions)
          .set({ status: "pending_payment" })
          .where(eq(schema.checkoutSessions.id, sessionId))
      },
    )

    logCalls = []
    const secondEventId = `evt-${randomUUID()}`
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: secondEventId,
    })
    const blockedLogs = logsByEvent("webhook_duplicate_fanout_blocked")
    expect(blockedLogs).toHaveLength(1)
    expect((blockedLogs[0]?.obj as Record<string, unknown>)["sessionId"]).toBe(sessionId)
    expect(blockedLogs[0]?.level).toBe("error")

    // Original order unchanged; no duplicate row inserted.
    const ordersAfter2 = await readOrders(sessionId)
    expect(ordersAfter2).toHaveLength(1)
    expect(ordersAfter2[0]?.id).toBe(firstOrderId)

    // B7 invariant: even though the duplicate fan-out was blocked,
    // the surrounding withAdmin tx MUST commit so the admin_bypass_audit
    // row persists. The audit reason is keyed off the pspEventId of the
    // second delivery, not the session — assert on the exact reason.
    const auditCount = await countAdminBypassAuditByReason(
      `hitpay webhook: order payment ${secondEventId}`,
    )
    expect(auditCount).toBe(1)
  })

  // ── Tests 17–21: paid happy path ─────────────────────────────────────

  it("17 — single-store, no voucher, no brand discount → paid + ledger 1 credit + 2 debits", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    const paymentId = `pay-${randomUUID()}`

    const res = await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect(res.statusCode).toBe(200)

    const session = await readSession(sessionId)
    expect(session?.status).toBe("paid")
    expect(session?.pspPaymentId).toBe(paymentId)
    expect(session?.pspFeeSen).toBe(95n)

    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.paymentStatus).toBe("paid")
    expect(order.fulfilmentStatus).toBe("processing")
    expect(order.bomyCommissionPct).toBe(25)
    expect(order.sellerPayoutSen + order.bomyCommissionSen + order.pspFeeAllocatedSen).toBe(5500n)
    expect(order.pspFeeAllocatedSen).toBe(95n)

    const ledger = await readLedger(sessionId)
    const credits = ledger.filter((l) => l.direction === "credit")
    const debits = ledger.filter((l) => l.direction === "debit")
    expect(credits).toHaveLength(1)
    expect(credits[0]?.amountMinor).toBe(5500n)
    expect(credits[0]?.account).toBe("revenue:regular_order")
    expect(debits).toHaveLength(2)
    expect(debits.find((d) => d.account === "payable:seller_payout")?.amountMinor).toBe(
      order.sellerPayoutSen,
    )
    expect(debits.find((d) => d.account === "expense:processing_fee")?.amountMinor).toBe(95n)

    expect(await readReservationStatuses(sessionId)).toEqual(["converted"])
  })

  it("18 — three-store cart → 3 orders sorted by storeId; sum(psp_fee_allocated) = session.psp_fee_sen", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      storeIndexes: [0, 1, 2],
      // each store: retail 5000 + shipping 500 = 5500 → total 16500
    })
    const paymentId = `pay-${randomUUID()}`
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId,
      amountStr: "165.00",
      feesStr: "1.50",
      eventId: `evt-${randomUUID()}`,
    })

    const session = await readSession(sessionId)
    expect(session?.status).toBe("paid")
    expect(session?.pspFeeSen).toBe(150n)

    const orders = await readOrders(sessionId) // ordered by storeId
    expect(orders).toHaveLength(3)
    for (let i = 0; i < orders.length - 1; i++) {
      expect(orders[i]!.storeId < orders[i + 1]!.storeId).toBe(true)
    }
    const sumFee = orders.reduce((acc, o) => acc + o.pspFeeAllocatedSen, 0n)
    expect(sumFee).toBe(150n)
    // Each order journal must balance.
    for (const o of orders) {
      expect(o.sellerPayoutSen + o.bomyCommissionSen + o.pspFeeAllocatedSen).toBe(5500n)
    }
    expect(await readReservationStatuses(sessionId)).toEqual([
      "converted",
      "converted",
      "converted",
    ])
  })

  it("19 — voucher present → redeemed_at + redeemed_checkout_session_id set; reserved cleared", async () => {
    const { sessionId, pspPaymentRequestId, voucherId } = await seedFullSession({
      withVoucher: true,
      storeVoucherContributionSen: [1000n],
      // total = 5000 + 500 - 1000 = 4500
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "45.00",
      feesStr: "0.80",
      eventId: `evt-${randomUUID()}`,
    })
    expect((await readSession(sessionId))?.status).toBe("paid")
    const v = await readVoucher(voucherId!)
    expect(v?.redeemedAt).not.toBeNull()
    expect(v?.redeemedCheckoutSessionId).toBe(sessionId)
    expect(v?.reservedCheckoutSessionId).toBeNull()
  })

  it("20 — brand discount active → commission applied on discounted_subtotal, not retail", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      storeRetailSen: [5000n],
      storeBrandDiscountSen: [1000n],
      storeShippingSen: [0n],
      // discountedSubtotal = 4000; total = 4000 + 0 - 0 - 0 = 4000
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "40.00",
      feesStr: "0.00",
      eventId: `evt-${randomUUID()}`,
    })
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.brandDiscountSen).toBe(1000n)
    expect(order.discountedSubtotalSen).toBe(4000n)
    // With pspFee=0, voucher=0, shipping=0, commission_pct=25:
    //   sellerPayout = floor(4000 * 75/100) = 3000
    //   bomy = 4000 - 3000 - 0 = 1000  (i.e. 25% of discountedSubtotal)
    expect(order.sellerPayoutSen).toBe(3000n)
    expect(order.bomyCommissionSen).toBe(1000n)
    // Sanity: 25% applied to retail would be 1250; we expect 1000.
  })

  it("21 — voucher on one of two stores → both orders sum to session totals", async () => {
    const { sessionId, pspPaymentRequestId, voucherId } = await seedFullSession({
      withVoucher: true,
      storeIndexes: [0, 1],
      storeRetailSen: [5000n, 5000n],
      storeShippingSen: [500n, 500n],
      storeVoucherContributionSen: [1000n, 0n],
      // total = 10000 + 1000 - 1000 - 0 = 10000
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "100.00",
      feesStr: "1.00",
      eventId: `evt-${randomUUID()}`,
    })
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(2)
    const sumRetail = orders.reduce((acc, o) => acc + o.retailSubtotalSen, 0n)
    const sumShipping = orders.reduce((acc, o) => acc + o.shippingFeeSen, 0n)
    const sumVoucher = orders.reduce((acc, o) => acc + o.voucherContributionSen, 0n)
    const sumPspFee = orders.reduce((acc, o) => acc + o.pspFeeAllocatedSen, 0n)
    expect(sumRetail).toBe(10000n)
    expect(sumShipping).toBe(1000n)
    expect(sumVoucher).toBe(1000n)
    expect(sumPspFee).toBe(100n)
    const v = await readVoucher(voucherId!)
    expect(v?.redeemedCheckoutSessionId).toBe(sessionId)
  })

  // ── Tests 22–26: review-state guards ─────────────────────────────────

  it("22 — amount mismatch → payment_review_required (amount_mismatch); reservations untouched", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "99.99", // != 55.00
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("amount_mismatch")
    expect(await readOrders(sessionId)).toHaveLength(0)
    expect(await readLedger(sessionId)).toHaveLength(0)
    expect(await readReservationStatuses(sessionId)).toEqual(["active"])
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["expectedAmount"]).toBe("5500")
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["receivedAmount"]).toBe("9999")
  })

  it("22a — feesStr unparseable on completed → review (psp_fee_unparseable)", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "abc",
      eventId: `evt-${randomUUID()}`,
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("amount_mismatch")
    expect(await readOrders(sessionId)).toHaveLength(0)
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["cause"]).toBe("psp_fee_unparseable")
  })

  it("22b — feesStr exceeds gross → review (psp_fee_exceeds_gross)", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "1000.00", // > 55.00 gross
      eventId: `evt-${randomUUID()}`,
    })
    const session = await readSession(sessionId)
    expect(session?.paymentReviewReason).toBe("amount_mismatch")
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["cause"]).toBe("psp_fee_exceeds_gross")
  })

  it("22c — completed event with empty payment_id → review; psp_payment_id stays NULL", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: "", // missing
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("amount_mismatch")
    expect(session?.pspPaymentId).toBeNull()
    const reviewLogs = logsByEvent("order_payment_review")
    expect(reviewLogs).toHaveLength(1)
    expect((reviewLogs[0]?.obj as Record<string, unknown>)["cause"]).toBe(
      "missing_payment_id_on_completed",
    )
  })

  it("23 — regular_order_commission_pct missing → invalid_commission_config", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "drop pct" }, async (tx) => {
      await tx
        .delete(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "regular_order_commission_pct"))
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("invalid_commission_config")
    expect(await readOrders(sessionId)).toHaveLength(0)
  })

  it("24 — regular_order_commission_pct = 125 → invalid_commission_config", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "bad pct 125" }, async (tx) => {
      await tx
        .update(schema.platformConfig)
        .set({ value: 125 })
        .where(eq(schema.platformConfig.key, "regular_order_commission_pct"))
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("invalid_commission_config")
  })

  it('25 — regular_order_commission_pct = "twenty-five" (non-numeric) → invalid_commission_config', async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "bad pct str" }, async (tx) => {
      await tx
        .update(schema.platformConfig)
        .set({ value: "twenty-five" })
        .where(eq(schema.platformConfig.key, "regular_order_commission_pct"))
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect((await readSession(sessionId))?.paymentReviewReason).toBe("invalid_commission_config")
  })

  it("26 — voucher race: reserved cleared before inject → orders+ledger commit; session voucher_claim_failed", async () => {
    const { sessionId, pspPaymentRequestId, voucherId } = await seedFullSession({
      withVoucher: true,
      storeVoucherContributionSen: [1000n],
      // total = 5000 + 500 - 1000 = 4500
    })

    // Simulate a parallel cancel/expiry path NULLing the voucher
    // reservation before the webhook arrives (second connection).
    await withAdmin(
      lockDb.db,
      { userId: SYSTEM_ACTOR, reason: "race null voucher" },
      async (tx) => {
        await tx
          .update(schema.vouchers)
          .set({ reservedCheckoutSessionId: null, reservedAt: null })
          .where(eq(schema.vouchers.id, voucherId!))
      },
    )

    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "45.00",
      feesStr: "0.80",
      eventId: `evt-${randomUUID()}`,
    })

    const session = await readSession(sessionId)
    expect(session?.status).toBe("payment_review_required")
    expect(session?.paymentReviewReason).toBe("voucher_claim_failed")
    // Orders + ledger STAY committed even though session is in review.
    expect(await readOrders(sessionId)).toHaveLength(1)
    expect(await readLedger(sessionId)).not.toHaveLength(0)
    expect(await readReservationStatuses(sessionId)).toEqual(["converted"])

    const voucherClaimFailedLogs = logsByEvent("voucher_claim_failed")
    expect(voucherClaimFailedLogs).toHaveLength(1)
    expect(voucherClaimFailedLogs[0]?.level).toBe("error")
  })

  // ── Tests 27–29d: failed path ────────────────────────────────────────

  it("27 — payment_request.failed → reservations released; stock restored; voucher released; no orders/ledger", async () => {
    const {
      sessionId,
      pspPaymentRequestId,
      voucherId,
      variantIds: vids,
    } = await seedFullSession({
      withVoucher: true,
      storeVoucherContributionSen: [1000n],
    })
    const stockBefore = await readStock(vids[0]!)
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "failed",
      amountStr: "45.00",
      feesStr: "0.80",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("failed")
    expect(await readOrders(sessionId)).toHaveLength(0)
    expect(await readLedger(sessionId)).toHaveLength(0)
    expect(await readReservationStatuses(sessionId)).toEqual(["released"])
    expect(await readStock(vids[0]!)).toBe(stockBefore + 1)
    const v = await readVoucher(voucherId!)
    expect(v?.reservedCheckoutSessionId).toBeNull()
    expect(logsByEvent("order_payment_failed")).toHaveLength(1)
  })

  it("28 — payment_request.failed on already-expired session → no-op; no log.error", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({ status: "expired" })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "failed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })
    expect((await readSession(sessionId))?.status).toBe("expired")
    expect(await readOrders(sessionId)).toHaveLength(0)
    // runFailureRelease's atomic UPDATE matches 0 rows on a non-
    // pending session and logs at info, not error.
    expect(logCalls.filter((l) => l.level === "error")).toHaveLength(0)
  })

  it("29 — failed arrives after paid (different event_id) → runFailureRelease short-circuits; session stays paid", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect((await readSession(sessionId))?.status).toBe("paid")
    const ordersAfterPaid = await readOrders(sessionId)

    logCalls = []
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "failed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })
    expect((await readSession(sessionId))?.status).toBe("paid")
    expect(await readOrders(sessionId)).toHaveLength(ordersAfterPaid.length)
    // Reservations stay converted; nothing rolled back.
    expect(await readReservationStatuses(sessionId)).toEqual(["converted"])
  })

  it("29a — failed with empty amountStr → still releases (B5: status routes before parse)", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "failed",
      amountStr: "",
      feesStr: "0.00",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })
    expect((await readSession(sessionId))?.status).toBe("failed")
    expect(await readReservationStatuses(sessionId)).toEqual(["released"])
  })

  it("29b — failed with amountStr=0.00 → releases", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "failed",
      amountStr: "0.00",
      feesStr: "0.00",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })
    expect((await readSession(sessionId))?.status).toBe("failed")
    expect(await readReservationStatuses(sessionId)).toEqual(["released"])
  })

  it("29c — failed with amountStr=abc → releases (no parseSen throw escapes)", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      status: "failed",
      amountStr: "abc",
      feesStr: "abc",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })
    expect((await readSession(sessionId))?.status).toBe("failed")
    expect(await readReservationStatuses(sessionId)).toEqual(["released"])
  })

  it("29d — two failed sessions with empty paymentId → both end failed; psp_payment_id stays NULL on both (B9 partial unique index trap)", async () => {
    const s1 = await seedFullSession()
    const s2 = await seedFullSession()

    await injectOrder({
      paymentRequestId: s1.pspPaymentRequestId,
      paymentId: "",
      status: "failed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })
    await injectOrder({
      paymentRequestId: s2.pspPaymentRequestId,
      paymentId: "",
      status: "failed",
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
    })

    const sess1 = await readSession(s1.sessionId)
    const sess2 = await readSession(s2.sessionId)
    expect(sess1?.status).toBe("failed")
    expect(sess2?.status).toBe("failed")
    expect(sess1?.pspPaymentId).toBeNull()
    expect(sess2?.pspPaymentId).toBeNull()
  })

  // ── Tests 30–31: lock + race ─────────────────────────────────────────

  it("30 — two concurrent injects with same event_id → exactly one set of orders+ledger", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    const eventId = `evt-${randomUUID()}`
    const paymentId = `pay-${randomUUID()}`

    // Promise.all interleaves at the Fastify event loop; even when the
    // route serialises, the INSERT … ON CONFLICT DO NOTHING on
    // processed_webhook_events is the gate that guarantees only one
    // transaction owns the event. Validate the steady state, not the
    // interleaving.
    const [r1, r2] = await Promise.all([
      injectOrder({
        paymentRequestId: pspPaymentRequestId,
        paymentId,
        amountStr: "55.00",
        feesStr: "0.95",
        eventId,
      }),
      injectOrder({
        paymentRequestId: pspPaymentRequestId,
        paymentId,
        amountStr: "55.00",
        feesStr: "0.95",
        eventId,
      }),
    ])
    expect(r1.statusCode).toBe(200)
    expect(r2.statusCode).toBe(200)
    expect(await readOrders(sessionId)).toHaveLength(1)
    const ledger = await readLedger(sessionId)
    expect(ledger.filter((l) => l.direction === "credit")).toHaveLength(1)
  })

  it("31 — webhook holds session FOR UPDATE; real expiry job's SKIP LOCKED defers; fan-out completes after release", async () => {
    // Seed with a 6-minute-past expiry so the reservation actually
    // qualifies as an expiry-job candidate (the job filters
    // r.expires_at < now() - interval '5 minutes'). Without this, the
    // job would skip the candidate for the WRONG reason (not yet
    // expired) and a regression in the lock shape would still pass.
    const {
      sessionId,
      pspPaymentRequestId,
      variantIds: vids,
    } = await seedFullSession({
      reservationExpiresAt: new Date(Date.now() - 6 * 60 * 1000),
    })
    const stockBefore = await readStock(vids[0]!)

    // (a) Hold a FOR UPDATE lock on the session via lockDb so the
    // locker and the job run on different physical connections. The
    // locker awaits `lockHeld` inside the tx body, keeping the row
    // exclusively locked until we resolve the promise below.
    let release!: () => void
    const lockHeld = new Promise<void>((r) => {
      release = r
    })
    const lockerDone = withAdmin(
      lockDb.db,
      { userId: SYSTEM_ACTOR, reason: "test 31 lock holder" },
      async (tx) => {
        await tx
          .select()
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId))
          .for("update")
        await lockHeld
      },
    )

    // Tiny wait so the locker definitely takes the lock before the
    // job runs. Without this the job race is non-deterministic.
    await new Promise((r) => setTimeout(r, 50))

    // (b) Run the REAL inventory-expiry job. Its candidate SQL joins
    // checkout_sessions + inventory_reservations and locks
    // `FOR UPDATE OF cs, r SKIP LOCKED`. The held session lock
    // forces the join row to be skipped → the job MUST NOT release
    // this reservation or restore stock for it.
    const jobLogs: Array<{ obj: object; msg: string }> = []
    await runInventoryReservationExpiryJob({
      db: setupDb.db,
      log: { info: (obj, msg) => jobLogs.push({ obj, msg }) },
    })
    expect(await readReservationStatuses(sessionId)).toEqual(["active"])
    expect(await readStock(vids[0]!)).toBe(stockBefore)
    expect((await readSession(sessionId))?.status).toBe("pending_payment")

    // (c) Release the locker so the rest of the test owns the row.
    release()
    await lockerDone

    // (d) Inject the webhook normally — fan-out completes against the
    // still-active reservation, converting it.
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect((await readSession(sessionId))?.status).toBe("paid")
    expect(await readReservationStatuses(sessionId)).toEqual(["converted"])
  })

  // ── Tests 31a–31d: PSP fee + commission edges ────────────────────────

  it("31a — feesStr=0.95 on 50.00 charge → session.psp_fee_sen=95n; per-store sum=95n", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      storeRetailSen: [5000n],
      storeShippingSen: [0n],
      // total = 5000
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "50.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    const session = await readSession(sessionId)
    expect(session?.pspFeeSen).toBe(95n)
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    const sum = orders.reduce((acc, o) => acc + o.pspFeeAllocatedSen, 0n)
    expect(sum).toBe(95n)
  })

  it("31b — single-store feesStr=0.95 → 1 order with psp_fee_allocated=95n; 1 processing_fee ledger debit=95n", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      storeRetailSen: [5000n],
      storeShippingSen: [0n],
      // total = 5000
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "50.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    expect(orders[0]?.pspFeeAllocatedSen).toBe(95n)
    const ledger = await readLedger(sessionId)
    const feeLegs = ledger.filter((l) => l.account === "expense:processing_fee")
    expect(feeLegs).toHaveLength(1)
    expect(feeLegs[0]?.amountMinor).toBe(95n)
  })

  it("31c — 3-store cart, feesStr=0.07 (7 sen) → floor allocation; SUM=7n; last store absorbs remainder", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      storeIndexes: [0, 1, 2],
      storeRetailSen: [5000n, 5000n, 5000n],
      storeShippingSen: [0n, 0n, 0n],
      // total = 15000 (no shipping)
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "150.00",
      feesStr: "0.07",
      eventId: `evt-${randomUUID()}`,
    })
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(3)
    const sum = orders.reduce((acc, o) => acc + o.pspFeeAllocatedSen, 0n)
    expect(sum).toBe(7n)
    // Equal nets (5000 each) → floor allocator gives 2/2/3 (last absorbs remainder).
    // Orders are sorted by storeId asc; the last by storeId is also the
    // allocator's "last" store, so it carries the remainder.
    expect(orders[orders.length - 1]?.pspFeeAllocatedSen).toBe(3n)
    expect(orders[0]?.pspFeeAllocatedSen).toBe(2n)
    expect(orders[1]?.pspFeeAllocatedSen).toBe(2n)
  })

  it("31d — commission_pct=100 + zero shipping → seller_payout=0; no payable:seller_payout leg; journal balances", async () => {
    await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "pct=100" }, async (tx) => {
      await tx
        .update(schema.platformConfig)
        .set({ value: 100 })
        .where(eq(schema.platformConfig.key, "regular_order_commission_pct"))
    })
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      storeRetailSen: [5000n],
      storeShippingSen: [0n],
      // total = 5000
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "50.00",
      feesStr: "0.00",
      eventId: `evt-${randomUUID()}`,
    })
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    expect(orders[0]?.sellerPayoutSen).toBe(0n)
    expect(orders[0]?.bomyCommissionSen).toBe(5000n)
    const ledger = await readLedger(sessionId)
    // 1 credit, 0 seller_payout (B10 gate), 0 processing_fee (fee=0).
    expect(ledger.filter((l) => l.direction === "credit")).toHaveLength(1)
    expect(ledger.filter((l) => l.account === "payable:seller_payout")).toHaveLength(0)
    expect(ledger.filter((l) => l.account === "expense:processing_fee")).toHaveLength(0)
  })

  // ── Tests 32–35: edge cases ──────────────────────────────────────────

  it("32 — voucher_contribution > bomy_share → negative bomy_commission_sen; bomy_commission_negative warn log includes orderId", async () => {
    // retail=5000, shipping=0, voucherContribution=4500, total=500, fee=1
    // catalog_psp = 1; net_catalog = 4999; seller_share = floor(4999*75/100)=3749
    // bomy = 4999 - 3749 - 4500 = -3250
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      withVoucher: true,
      voucherFixedAmountSen: 4500n,
      storeRetailSen: [5000n],
      storeShippingSen: [0n],
      storeVoucherContributionSen: [4500n],
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "5.00",
      feesStr: "0.01",
      eventId: `evt-${randomUUID()}`,
    })
    const session = await readSession(sessionId)
    expect(session?.status).toBe("paid")
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    expect(orders[0]!.bomyCommissionSen < 0n).toBe(true)

    const warnLogs = logsByEvent("bomy_commission_negative")
    expect(warnLogs).toHaveLength(1)
    const obj = warnLogs[0]?.obj as Record<string, unknown>
    expect(obj["orderId"]).toBe(orders[0]!.id)
    expect(obj["storeId"]).toBe(orders[0]!.storeId)
    expect(warnLogs[0]?.level).toBe("warn")
  })

  it("33 — feesStr=0.00 → no processing_fee ledger leg; psp_fee_allocated=0 on order", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession()
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.00",
      eventId: `evt-${randomUUID()}`,
    })
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    expect(orders[0]?.pspFeeAllocatedSen).toBe(0n)
    const ledger = await readLedger(sessionId)
    expect(ledger.filter((l) => l.account === "expense:processing_fee")).toHaveLength(0)
  })

  it("34 — zero shipping across all stores → seller_payout = seller_share only (no shipping_psp_fee)", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      storeIndexes: [0, 1],
      storeRetailSen: [5000n, 5000n],
      storeShippingSen: [0n, 0n],
      // total = 10000
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "100.00",
      feesStr: "0.00",
      eventId: `evt-${randomUUID()}`,
    })
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(2)
    for (const o of orders) {
      expect(o.shippingFeeSen).toBe(0n)
      expect(o.pspFeeAllocatedSen).toBe(0n)
      // seller_share = floor(5000 * 75/100) = 3750
      expect(o.sellerPayoutSen).toBe(3750n)
      expect(o.bomyCommissionSen).toBe(1250n)
    }
  })

  it("35 — buyer == seller (self-purchase) → orders + ledger process normally; no exclusion", async () => {
    const { sessionId, pspPaymentRequestId } = await seedFullSession({
      buyerOverrideId: buyerSellerId,
      useBuyerSellerStore: true,
    })
    await injectOrder({
      paymentRequestId: pspPaymentRequestId,
      paymentId: `pay-${randomUUID()}`,
      amountStr: "55.00",
      feesStr: "0.95",
      eventId: `evt-${randomUUID()}`,
    })
    expect((await readSession(sessionId))?.status).toBe("paid")
    const orders = await readOrders(sessionId)
    expect(orders).toHaveLength(1)
    expect(orders[0]?.buyerId).toBe(buyerSellerId)
    expect(orders[0]?.storeId).toBe(buyerSellerStoreId)
    const ledger = await readLedger(sessionId)
    expect(ledger.filter((l) => l.direction === "credit")).toHaveLength(1)
  })
})
