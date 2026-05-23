/**
 * Integration tests for apps/api/src/webhooks/hitpay/failure-release.ts
 * (PR #32 Task 8). Real Postgres; skips when DATABASE_URL is unset.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/api test failure-release.test.ts --run
 *
 * Test matrix (Charlie's Task 8 review checklist):
 *   - pending_payment → failed releases active reservations, restores
 *     stock, releases voucher, sets psp_payment_id (paymentId present).
 *   - pending_payment, no voucher → same minus the voucher UPDATE.
 *   - Already paid / payment_review_required / cancelled / expired →
 *     short-circuit before touching reservations / stock / voucher.
 *   - paymentId = "" → psp_payment_id stays NULL (Bob B9 conditional spread).
 *   - Deliberate mid-tx throw → whole transaction rolls back; session
 *     stays pending_payment, reservations stay active, stock unchanged,
 *     voucher still reserved.
 *   - Source-code guard (grep): no orders/order_items/order_payouts/
 *     ledger_entries references in the helper.
 */
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

import { makeDb, schema, withAdmin } from "@bomy/db"
import type { CheckoutSessionStatus } from "@bomy/db"
import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { runFailureRelease } from "../../src/webhooks/hitpay/failure-release.js"
import type { EventIdentity } from "../../src/webhooks/hitpay/idempotency.js"
import type { CheckoutSessionRow } from "../../src/webhooks/hitpay/types.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL)

// ─── Source-only guard: helper must not touch orders/ledger surfaces ──

describe("failure-release.ts source surface", () => {
  it("does not reference orders / order_items / order_payouts / ledger_entries", () => {
    const src = readFileSync(
      join(__dirname, "../../src/webhooks/hitpay/failure-release.ts"),
      "utf8",
    )
    // schema.X access patterns are the relevant surface — even via
    // destructuring those would show as schema.X somewhere or import
    // patterns. The helper imports `schema` and we grep into it.
    expect(src).not.toMatch(/schema\.orders\b/)
    expect(src).not.toMatch(/schema\.orderItems\b/)
    expect(src).not.toMatch(/schema\.orderPayouts\b/)
    expect(src).not.toMatch(/schema\.ledgerEntries\b/)
    // Defense against future destructuring imports
    expect(src).not.toMatch(/\borders\b\s*[,}]/)
    expect(src).not.toMatch(/\bledgerEntries\b/)
  })
})

// ─── Integration tests against real Postgres ──────────────────────────

describe.skipIf(!shouldRun)("runFailureRelease (integration)", () => {
  let handle: ReturnType<typeof makeDb>
  let buyerId: string
  let sellerId: string
  let storeId: string
  let productId: string
  let variantId: string

  // Fastify app stub — runFailureRelease only uses `args.app.log.{info}`.
  // Capture log calls so tests can assert on the structured payload.
  type LogCall = { level: "info" | "error" | "warn"; obj: unknown; msg: string }
  let logCalls: LogCall[]
  function makeFakeApp(): FastifyInstance {
    return {
      log: {
        info: (obj: unknown, msg: string) => logCalls.push({ level: "info", obj, msg }),
        error: (obj: unknown, msg: string) => logCalls.push({ level: "error", obj, msg }),
        warn: (obj: unknown, msg: string) => logCalls.push({ level: "warn", obj, msg }),
      },
    } as unknown as FastifyInstance
  }

  function makeIdentity(): EventIdentity {
    return {
      pspProvider: "hitpay",
      pspEventId: `evt-${randomUUID()}`,
      eventType: "payment_request.failed",
      payloadHash: "deadbeef",
    }
  }

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })
    buyerId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    productId = randomUUID()
    variantId = randomUUID()

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "failure-release test seed" },
      async (tx) => {
        await tx.insert(schema.users).values([
          { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
          { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
        ])
        await tx.insert(schema.stores).values({
          id: storeId,
          ownerId: sellerId,
          name: "FR Store",
          slug: `fr-${storeId}`,
          status: "active",
        })
        await tx.insert(schema.products).values({
          id: productId,
          storeId,
          name: "FR Product",
          slug: `fr-${productId}`,
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
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "failure-release test teardown" },
      async (tx) => {
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerId))
        await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, variantId))
        await tx.delete(schema.products).where(eq(schema.products.id, productId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
      },
    )
    await handle.close()
  })

  beforeEach(async () => {
    logCalls = []
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "failure-release test reset" },
      async (tx) => {
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerId))
        // Restore variant stock to baseline 100.
        await tx
          .update(schema.productVariants)
          .set({ stockCount: 100 })
          .where(eq(schema.productVariants.id, variantId))
      },
    )
  })

  // ── Helpers ─────────────────────────────────────────────────────────

  interface SeedOptions {
    status?: CheckoutSessionStatus
    withVoucher?: boolean
    reservationQuantity?: number
    paymentReviewReason?: string | null
  }

  async function seedSession(opts: SeedOptions = {}): Promise<{
    sessionId: string
    voucherId: string | null
  }> {
    const sessionId = randomUUID()
    const reservationQty = opts.reservationQuantity ?? 2
    const voucherId = opts.withVoucher ? randomUUID() : null

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "seed session" }, async (tx) => {
      // Circular FK: checkout_sessions.voucher_id → vouchers.id AND
      // vouchers.reserved_checkout_session_id → checkout_sessions.id.
      // Break the cycle by inserting the voucher with NULL reservation
      // first, then the session referencing the voucher, then UPDATE
      // the voucher to point at the session.
      if (voucherId) {
        await tx.insert(schema.vouchers).values({
          id: voucherId,
          userId: buyerId,
          code: `vc-${voucherId}`,
          type: "fixed_myr",
          fixedAmountSen: 500n,
          issuedMonth: "2026-05",
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        })
      }
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: opts.status ?? "pending_payment",
        shippingAddress: {},
        totalCatalogSen: 5000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 5500n,
        voucherId,
        paymentReviewReason: opts.paymentReviewReason ?? null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      if (voucherId) {
        await tx
          .update(schema.vouchers)
          .set({ reservedCheckoutSessionId: sessionId, reservedAt: new Date() })
          .where(eq(schema.vouchers.id, voucherId))
      }
      await tx.insert(schema.inventoryReservations).values({
        checkoutSessionId: sessionId,
        variantId,
        quantity: reservationQty,
        status: "active",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      // Simulate the PR #31 stock decrement that goes with the active reservation.
      await tx
        .update(schema.productVariants)
        .set({ stockCount: 100 - reservationQty })
        .where(eq(schema.productVariants.id, variantId))
    })

    return { sessionId, voucherId }
  }

  async function readSession(sessionId: string): Promise<CheckoutSessionRow> {
    const rows = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "read session" },
      async (tx) =>
        tx.select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId)),
    )
    if (!rows[0]) throw new Error(`session ${sessionId} not found`)
    return rows[0]
  }

  async function readReservationStatuses(sessionId: string): Promise<string[]> {
    return withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "read reservations" },
      async (tx) => {
        const rows = await tx
          .select({ status: schema.inventoryReservations.status })
          .from(schema.inventoryReservations)
          .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId))
        return rows.map((r) => r.status)
      },
    )
  }

  async function readVariantStock(): Promise<number> {
    const rows = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "read stock" },
      async (tx) =>
        tx
          .select({ stockCount: schema.productVariants.stockCount })
          .from(schema.productVariants)
          .where(eq(schema.productVariants.id, variantId)),
    )
    return rows[0]?.stockCount ?? -1
  }

  async function readVoucher(voucherId: string) {
    const rows = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "read voucher" },
      async (tx) =>
        tx
          .select({
            reservedSessionId: schema.vouchers.reservedCheckoutSessionId,
            reservedAt: schema.vouchers.reservedAt,
            redeemedAt: schema.vouchers.redeemedAt,
          })
          .from(schema.vouchers)
          .where(eq(schema.vouchers.id, voucherId)),
    )
    return rows[0]
  }

  // ── Tests ───────────────────────────────────────────────────────────

  it("pending_payment → failed: reservations released, stock restored, voucher cleared, psp_payment_id set", async () => {
    const { sessionId, voucherId } = await seedSession({
      withVoucher: true,
      reservationQuantity: 3,
    })
    expect(await readVariantStock()).toBe(97)

    const session = await readSession(sessionId)
    const paymentId = `pay-${randomUUID()}`
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "run release" }, async (tx) => {
      await runFailureRelease(
        tx,
        session,
        {
          app: makeFakeApp(),
          paymentId,
          eventIdentity: makeIdentity(),
        },
        [],
      )
    })

    const after = await readSession(sessionId)
    expect(after.status).toBe("failed")
    expect(after.pspPaymentId).toBe(paymentId)

    expect(await readReservationStatuses(sessionId)).toEqual(["released"])
    expect(await readVariantStock()).toBe(100)

    const voucher = await readVoucher(voucherId!)
    expect(voucher?.reservedSessionId).toBeNull()
    expect(voucher?.reservedAt).toBeNull()
    expect(voucher?.redeemedAt).toBeNull()

    // Structured log with reservationsReleased + voucherReleased.
    const successLog = logCalls.find((l) => l.msg.includes("order payment failed"))
    expect(successLog).toBeDefined()
    expect((successLog?.obj as Record<string, unknown>)["reservationsReleased"]).toBe(1)
    expect((successLog?.obj as Record<string, unknown>)["voucherReleased"]).toBe(true)
  })

  it("pending_payment, no voucher: same release path but voucher UPDATE skipped", async () => {
    const { sessionId } = await seedSession({ withVoucher: false, reservationQuantity: 2 })
    expect(await readVariantStock()).toBe(98)

    const session = await readSession(sessionId)
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "run release" }, async (tx) => {
      await runFailureRelease(
        tx,
        session,
        {
          app: makeFakeApp(),
          paymentId: "pay-novoucher",
          eventIdentity: makeIdentity(),
        },
        [],
      )
    })

    const after = await readSession(sessionId)
    expect(after.status).toBe("failed")
    expect(await readVariantStock()).toBe(100)
    expect(await readReservationStatuses(sessionId)).toEqual(["released"])

    const successLog = logCalls.find((l) => l.msg.includes("order payment failed"))
    expect((successLog?.obj as Record<string, unknown>)["voucherReleased"]).toBe(false)
  })

  // Short-circuit cases: 4 sub-tests covering paid / payment_review_required / cancelled / expired.
  for (const terminalState of [
    "paid",
    "payment_review_required",
    "cancelled",
    "expired",
  ] as const) {
    it(`session already ${terminalState} → no-op: reservations, stock, voucher unchanged`, async () => {
      const { sessionId, voucherId } = await seedSession({
        withVoucher: true,
        reservationQuantity: 2,
        // payment_review_required requires payment_review_reason (CHECK constraint)
        status: terminalState,
        paymentReviewReason:
          terminalState === "payment_review_required" ? "voucher_claim_failed" : null,
      })
      const stockBefore = await readVariantStock()
      const voucherBefore = await readVoucher(voucherId!)

      const session = await readSession(sessionId)
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "run release" }, async (tx) => {
        await runFailureRelease(
          tx,
          session,
          {
            app: makeFakeApp(),
            paymentId: `pay-${terminalState}`,
            eventIdentity: makeIdentity(),
          },
          [],
        )
      })

      const after = await readSession(sessionId)
      expect(after.status).toBe(terminalState) // unchanged
      expect(after.pspPaymentId).toBeNull() // never set

      expect(await readReservationStatuses(sessionId)).toEqual(["active"]) // untouched
      expect(await readVariantStock()).toBe(stockBefore) // unchanged

      const voucherAfter = await readVoucher(voucherId!)
      // Voucher reservation must still be intact — this is the
      // payment_review_required + voucher_claim_failed protection.
      expect(voucherAfter?.reservedSessionId).toBe(voucherBefore?.reservedSessionId)
      expect(voucherAfter?.redeemedAt).toEqual(voucherBefore?.redeemedAt)

      // Should have emitted exactly one info log explaining the no-op.
      const noopLog = logCalls.find((l) => l.msg.includes("already terminal"))
      expect(noopLog).toBeDefined()
      expect((noopLog?.obj as Record<string, unknown>)["sessionStatus"]).toBe(terminalState)
    })
  }

  it("Bob B9: paymentId = '' leaves psp_payment_id IS NULL (conditional spread)", async () => {
    const { sessionId } = await seedSession({ reservationQuantity: 1 })

    const session = await readSession(sessionId)
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "run release" }, async (tx) => {
      await runFailureRelease(
        tx,
        session,
        {
          app: makeFakeApp(),
          paymentId: "", // empty
          eventIdentity: makeIdentity(),
        },
        [],
      )
    })

    const after = await readSession(sessionId)
    expect(after.status).toBe("failed")
    expect(after.pspPaymentId).toBeNull() // critical: not empty string
  })

  it("Bob B9 follow-on: two failed sessions with paymentId='' both complete without unique-index collision", async () => {
    // Partial unique index `WHERE psp_payment_id IS NOT NULL` would treat
    // "" as a real value. Both failed-event releases must run without
    // colliding on the index — which they do precisely because of the
    // conditional spread (column is never set to "").
    const a = await seedSession({ reservationQuantity: 1 })
    const sessionA = await readSession(a.sessionId)
    const b = await seedSession({ reservationQuantity: 1 })
    const sessionB = await readSession(b.sessionId)

    for (const session of [sessionA, sessionB]) {
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "run release" }, async (tx) => {
        await runFailureRelease(
          tx,
          session,
          {
            app: makeFakeApp(),
            paymentId: "",
            eventIdentity: makeIdentity(),
          },
          [],
        )
      })
    }

    expect((await readSession(sessionA.id)).status).toBe("failed")
    expect((await readSession(sessionB.id)).status).toBe("failed")
    expect((await readSession(sessionA.id)).pspPaymentId).toBeNull()
    expect((await readSession(sessionB.id)).pspPaymentId).toBeNull()
  })

  it("transaction-rollback safety: deliberate throw mid-tx leaves all state at pre-failure values", async () => {
    // Pre-state: session pending_payment, 1 active reservation, stock = 99
    // (post-decrement, pre-failure), voucher reserved.
    const { sessionId, voucherId } = await seedSession({
      withVoucher: true,
      reservationQuantity: 1,
    })

    // Capture stockBefore from the persisted post-seed state, NOT the
    // pre-seed baseline. This is the value the database held while the
    // reservation was active — exactly what should be preserved on
    // rollback.
    const stockBefore = await readVariantStock()
    expect(stockBefore).toBe(99)

    const voucherBefore = await readVoucher(voucherId!)
    expect(voucherBefore?.reservedSessionId).toBe(sessionId)

    const session = await readSession(sessionId)

    // Run withAdmin → call runFailureRelease successfully → THROW.
    // The throw propagates out of withAdmin, which rolls back the
    // entire transaction (session UPDATE, reservation UPDATE, stock
    // UPDATE, voucher UPDATE) plus the admin_bypass_audit row.
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rollback probe" }, async (tx) => {
        await runFailureRelease(
          tx,
          session,
          {
            app: makeFakeApp(),
            paymentId: `pay-${randomUUID()}`,
            eventIdentity: makeIdentity(),
          },
          [],
        )
        throw new Error("synthetic rollback trigger")
      }),
    ).rejects.toThrow("synthetic rollback trigger")

    // Persisted state must match the pre-failure values exactly.
    const sessionAfter = await readSession(sessionId)
    expect(sessionAfter.status).toBe("pending_payment")
    expect(sessionAfter.pspPaymentId).toBeNull()

    expect(await readReservationStatuses(sessionId)).toEqual(["active"])
    expect(await readVariantStock()).toBe(stockBefore)

    const voucherAfter = await readVoucher(voucherId!)
    expect(voucherAfter?.reservedSessionId).toBe(sessionId)
    expect(voucherAfter?.reservedAt).not.toBeNull()
    expect(voucherAfter?.redeemedAt).toBeNull()
  })

  it("conservative voucher release: when voucher.reserved_checkout_session_id points to a DIFFERENT session, this helper does not clear it", async () => {
    // Edge case: session A's voucher was somehow reserved against
    // session B (race / data anomaly). The helper for A must NOT clear
    // the voucher reservation pointing at B. Both sessions must exist
    // because vouchers.reserved_checkout_session_id has an FK.
    const { sessionId: sessionAId } = await seedSession({
      withVoucher: true,
      reservationQuantity: 1,
    })
    const sessionA = await readSession(sessionAId)
    const voucherIdA = sessionA.voucherId!

    // Seed a second real session as the "other" target. Use a separate
    // buyer-context to keep cleanup hooked into the global wipe.
    const otherSessionId = randomUUID()
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "seed other session" },
      async (tx) => {
        await tx.insert(schema.checkoutSessions).values({
          id: otherSessionId,
          userId: buyerId,
          status: "pending_payment",
          shippingAddress: {},
          totalCatalogSen: 5000n,
          totalShippingSen: 500n,
          totalBuyerPaysSen: 5500n,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        })
        await tx
          .update(schema.vouchers)
          .set({ reservedCheckoutSessionId: otherSessionId })
          .where(eq(schema.vouchers.id, voucherIdA))
      },
    )

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "run release" }, async (tx) => {
      await runFailureRelease(
        tx,
        sessionA,
        {
          app: makeFakeApp(),
          paymentId: `pay-${randomUUID()}`,
          eventIdentity: makeIdentity(),
        },
        [],
      )
    })

    // Session A transitioned to failed (release of reservations + stock still happened).
    expect((await readSession(sessionAId)).status).toBe("failed")
    // But the voucher reservation pointing at the other session is INTACT
    // because the WHERE reserved_checkout_session_id = sessionA.id predicate
    // matched zero rows for sessionA.
    const voucher = await readVoucher(voucherIdA)
    expect(voucher?.reservedSessionId).toBe(otherSessionId)

    // Bob R1: the structured log MUST reflect the actual mutation. Even
    // though the session had a voucher_id, the conservative predicates
    // matched 0 rows — voucherReleased must be `false`.
    const successLog = logCalls.find((l) => l.msg.includes("order payment failed"))
    expect((successLog?.obj as Record<string, unknown>)["voucherReleased"]).toBe(false)
  })

  it("conservative voucher release: when voucher.redeemed_at is NOT NULL, this helper does not clear the reservation", async () => {
    // Edge case: a parallel completed path has already redeemed the
    // voucher (set redeemed_at). A late failed webhook must not undo
    // the redemption marker.
    const { sessionId } = await seedSession({ withVoucher: true, reservationQuantity: 1 })
    const session = await readSession(sessionId)
    const voucherId = session.voucherId!

    const redeemedTime = new Date()
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "mark redeemed" }, async (tx) => {
      await tx
        .update(schema.vouchers)
        .set({ redeemedAt: redeemedTime, redeemedCheckoutSessionId: sessionId })
        .where(eq(schema.vouchers.id, voucherId))
    })

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "run release" }, async (tx) => {
      await runFailureRelease(
        tx,
        session,
        {
          app: makeFakeApp(),
          paymentId: `pay-${randomUUID()}`,
          eventIdentity: makeIdentity(),
        },
        [],
      )
    })

    // The session still transitions to failed (the helper's session
    // UPDATE only guards on status = pending_payment, which held at
    // call time). Reservations still get released. But the voucher
    // is preserved because redeemed_at IS NOT NULL → WHERE matches 0.
    expect((await readSession(sessionId)).status).toBe("failed")
    const voucher = await readVoucher(voucherId)
    expect(voucher?.redeemedAt).not.toBeNull()
    // The reserved_at + reserved_session_id remain whatever they were
    // (we mark redeemed but didn't change reservation pointers).
    expect(voucher?.reservedSessionId).toBe(sessionId)

    // Bob R1: log reflects actual mutation — voucherReleased is false
    // because the redeemed_at IS NULL predicate matched 0 rows.
    const successLog = logCalls.find((l) => l.msg.includes("order payment failed"))
    expect((successLog?.obj as Record<string, unknown>)["voucherReleased"]).toBe(false)
  })
})
