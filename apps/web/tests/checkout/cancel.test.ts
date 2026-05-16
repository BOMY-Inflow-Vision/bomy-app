/**
 * Integration tests — cancelPendingCheckout + getCheckoutSessionStatus (PR #31 Task 13).
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *   DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *   BOMY_RLS_READY=1 pnpm --filter @bomy/web test cancel.test.ts
 *
 * Bob's gates:
 *   - cancelPendingCheckout is auth-gated, ownership-enforced,
 *     idempotent, and no-ops on paid/terminal/foreign sessions.
 *   - getCheckoutSessionStatus is buyer-scoped (own only) and collapses
 *     foreign/missing into NOT_FOUND.
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { auth } from "@/auth"

import { cancelPendingCheckout, getCheckoutSessionStatus } from "../../src/app/checkout/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

const VALID_ADDRESS = {
  name: "Ali Ahmad",
  phone: "+60123456789",
  line1: "123 Jalan Merdeka",
  city: "Kuala Lumpur",
  postcode: "50000",
  state: "Kuala Lumpur",
  country: "MY",
} as const

describe.skipIf(!shouldRun)("cancelPendingCheckout + getCheckoutSessionStatus", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerAId: string
  let buyerBId: string
  let sellerId: string
  let storeId: string
  let productId: string
  let variantId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })

    buyerAId = randomUUID()
    buyerBId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    productId = randomUUID()
    variantId = randomUUID()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "cancel test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerAId, email: `${buyerAId}@test.bomy`, role: "buyer" },
        { id: buyerBId, email: `${buyerBId}@test.bomy`, role: "buyer" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Cancel Store",
        slug: `cancel-${storeId}`,
        status: "active",
        flatShippingFeeSen: 500n,
      })
      await tx.insert(schema.products).values({
        id: productId,
        storeId,
        name: "Cancel Product",
        slug: `cancel-${productId}`,
        status: "active",
      })
      await tx.insert(schema.productVariants).values({
        id: variantId,
        productId,
        name: "Single",
        priceMyrSen: 5000n,
        stockCount: 10,
        isActive: true,
      })
    })
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "cancel test teardown" },
      async (tx) => {
        await tx.delete(schema.inventoryReservations)
        await tx.delete(schema.checkoutSessionItems)
        await tx.delete(schema.checkoutSessionStores)
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerAId))
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerBId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerAId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerBId))
        await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, variantId))
        await tx.delete(schema.products).where(eq(schema.products.id, productId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerAId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerBId))
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
      },
    )
    await testDb.close()
  })

  beforeEach(async () => {
    mockAuth.mockReset()
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "cancel test reset" },
      async (tx) => {
        await tx.delete(schema.inventoryReservations)
        await tx.delete(schema.checkoutSessionItems)
        await tx.delete(schema.checkoutSessionStores)
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerAId))
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerBId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerAId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerBId))
        await tx
          .update(schema.productVariants)
          .set({ stockCount: 10, isActive: true })
          .where(eq(schema.productVariants.id, variantId))
      },
    )
  })

  function asBuyer(id: string) {
    mockAuth.mockResolvedValue({ user: { id, role: "buyer" } })
  }

  // Phase-1-style setup: insert a pending checkout session with one
  // line, one store row, one reservation, and a reserved voucher.
  // Stock is decremented to mirror what initiateCheckout would do.
  async function seedPendingSession(opts: {
    buyerId: string
    sessionId: string
    quantity: number
    withVoucher?: boolean
  }): Promise<{ voucherId: string | null }> {
    const voucherId = opts.withVoucher ? randomUUID() : null
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "seed pending session" },
      async (tx) => {
        // Voucher first (no reservation yet) so the session FK to
        // vouchers.id is satisfied. The reverse FK (voucher → session)
        // is filled by the UPDATE at the end.
        if (voucherId) {
          await tx.insert(schema.vouchers).values({
            id: voucherId,
            userId: opts.buyerId,
            code: `vc-${voucherId}`,
            type: "fixed_myr",
            fixedAmountSen: 500n,
            issuedMonth: "2026-05",
            expiresAt: new Date(Date.now() + 30 * 86400_000),
          })
        }
        await tx.insert(schema.checkoutSessions).values({
          id: opts.sessionId,
          userId: opts.buyerId,
          status: "pending_payment",
          pspProvider: "hitpay",
          shippingAddress: VALID_ADDRESS,
          voucherId,
          totalCatalogSen: BigInt(5000 * opts.quantity),
          totalShippingSen: 500n,
          voucherDiscountSen: voucherId ? 500n : 0n,
          brandDiscountTotalSen: 0n,
          totalBuyerPaysSen: BigInt(5000 * opts.quantity) + 500n - (voucherId ? 500n : 0n),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        })
        await tx.insert(schema.checkoutSessionItems).values({
          checkoutSessionId: opts.sessionId,
          storeId,
          variantId,
          productSnapshot: { name: "Cancel Product" },
          variantSnapshot: { name: "Single", priceMyrSen: "5000" },
          quantity: opts.quantity,
          unitPriceSen: 5000n,
          lineTotalSen: BigInt(5000 * opts.quantity),
          brandDiscountSen: 0n,
        })
        await tx.insert(schema.checkoutSessionStores).values({
          checkoutSessionId: opts.sessionId,
          storeId,
          retailSubtotalSen: BigInt(5000 * opts.quantity),
          brandDiscountSen: 0n,
          discountedSubtotalSen: BigInt(5000 * opts.quantity),
          voucherContributionSen: voucherId ? 500n : 0n,
          shippingFeeSen: 500n,
        })
        await tx.insert(schema.inventoryReservations).values({
          variantId,
          checkoutSessionId: opts.sessionId,
          quantity: opts.quantity,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        })
        await tx
          .update(schema.productVariants)
          .set({ stockCount: sql`${schema.productVariants.stockCount} - ${opts.quantity}` })
          .where(eq(schema.productVariants.id, variantId))
        if (voucherId) {
          await tx
            .update(schema.vouchers)
            .set({ reservedCheckoutSessionId: opts.sessionId, reservedAt: new Date() })
            .where(eq(schema.vouchers.id, voucherId))
        }
      },
    )
    return { voucherId }
  }

  // ─── cancelPendingCheckout ───────────────────────────────────────────

  it("happy cancel: pending session → cancelled; reservations released; stock restored; voucher released; ok:true", async () => {
    const sessionId = randomUUID()
    const { voucherId } = await seedPendingSession({
      buyerId: buyerAId,
      sessionId,
      quantity: 2,
      withVoucher: true,
    })
    asBuyer(buyerAId)

    const r = await cancelPendingCheckout(sessionId)
    expect(r.ok).toBe(true)

    const after = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read state" },
      async (tx) => {
        const sess = await tx
          .select()
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId))
        const res = await tx
          .select()
          .from(schema.inventoryReservations)
          .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId))
        const variant = await tx
          .select()
          .from(schema.productVariants)
          .where(eq(schema.productVariants.id, variantId))
        const voucher = voucherId
          ? await tx.select().from(schema.vouchers).where(eq(schema.vouchers.id, voucherId))
          : []
        return { sess: sess[0]!, res: res[0]!, variant: variant[0]!, voucher: voucher[0] }
      },
    )

    expect(after.sess.status).toBe("cancelled")
    expect(after.res.status).toBe("released")
    expect(after.variant.stockCount).toBe(10)
    expect(after.voucher?.reservedCheckoutSessionId).toBeNull()
    expect(after.voucher?.reservedAt).toBeNull()
    expect(after.voucher?.redeemedAt).toBeNull()

    // Audit row written under buyer_cancelled reason.
    const audit = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test find audit" },
      async (tx) =>
        tx
          .select()
          .from(schema.adminBypassAudit)
          .where(
            eq(
              schema.adminBypassAudit.reason,
              `checkout_compensation:buyer_cancelled:${sessionId}`,
            ),
          ),
    )
    expect(audit).toHaveLength(1)
    expect(audit[0]!.actorUserId).toBe(buyerAId)
  })

  it("idempotent: second cancel returns ok:true and does not double-release reservations or over-restore stock", async () => {
    const sessionId = randomUUID()
    await seedPendingSession({ buyerId: buyerAId, sessionId, quantity: 2 })
    asBuyer(buyerAId)

    const r1 = await cancelPendingCheckout(sessionId)
    const r2 = await cancelPendingCheckout(sessionId)
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)

    const after = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read state" },
      async (tx) => {
        const sess = await tx
          .select()
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId))
        const variant = await tx
          .select()
          .from(schema.productVariants)
          .where(eq(schema.productVariants.id, variantId))
        return { sess: sess[0]!, variant: variant[0]! }
      },
    )
    expect(after.sess.status).toBe("cancelled")
    expect(after.variant.stockCount).toBe(10) // not 12
  })

  it("unauthenticated → ok:false UNAUTHENTICATED; no DB writes", async () => {
    const sessionId = randomUUID()
    await seedPendingSession({ buyerId: buyerAId, sessionId, quantity: 1 })
    mockAuth.mockResolvedValue(null)

    const r = await cancelPendingCheckout(sessionId)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("UNAUTHENTICATED")

    const after = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read state" },
      async (tx) => {
        const sess = await tx
          .select()
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId))
        return sess[0]!
      },
    )
    expect(after.status).toBe("pending_payment")
  })

  it("foreign buyer: cancel against another buyer's session is a no-op; session stays pending; ok:true (ownership guard inside compensateInitiation)", async () => {
    const sessionId = randomUUID()
    await seedPendingSession({ buyerId: buyerAId, sessionId, quantity: 1 })
    // Authenticated as buyerB attempting to cancel buyerA's session.
    asBuyer(buyerBId)

    const r = await cancelPendingCheckout(sessionId)
    expect(r.ok).toBe(true)

    const after = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read state" },
      async (tx) => {
        const sess = await tx
          .select()
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId))
        const res = await tx
          .select()
          .from(schema.inventoryReservations)
          .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId))
        const variant = await tx
          .select()
          .from(schema.productVariants)
          .where(eq(schema.productVariants.id, variantId))
        return { sess: sess[0]!, res: res[0]!, variant: variant[0]! }
      },
    )
    expect(after.sess.status).toBe("pending_payment")
    expect(after.res.status).toBe("active")
    expect(after.variant.stockCount).toBe(9) // still decremented
  })

  it("paid session: cancel is a no-op via the pending_payment guard; session stays paid", async () => {
    const sessionId = randomUUID()
    await seedPendingSession({ buyerId: buyerAId, sessionId, quantity: 1 })
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "flip to paid" }, async (tx) => {
      await tx
        .update(schema.checkoutSessions)
        .set({ status: "paid" })
        .where(eq(schema.checkoutSessions.id, sessionId))
    })
    asBuyer(buyerAId)

    const r = await cancelPendingCheckout(sessionId)
    expect(r.ok).toBe(true)

    const after = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read state" },
      async (tx) => {
        const sess = await tx
          .select()
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId))
        const res = await tx
          .select()
          .from(schema.inventoryReservations)
          .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId))
        return { sess: sess[0]!, res: res[0]! }
      },
    )
    expect(after.sess.status).toBe("paid")
    expect(after.res.status).toBe("active") // reservations preserved for paid sessions
  })

  // ─── getCheckoutSessionStatus ────────────────────────────────────────

  it("status: own pending session → ok:true with status", async () => {
    const sessionId = randomUUID()
    await seedPendingSession({ buyerId: buyerAId, sessionId, quantity: 1 })
    asBuyer(buyerAId)

    const r = await getCheckoutSessionStatus(sessionId)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.status).toBe("pending_payment")
  })

  it("status: foreign buyer's session → NOT_FOUND (RLS hides it; no info leak)", async () => {
    const sessionId = randomUUID()
    await seedPendingSession({ buyerId: buyerAId, sessionId, quantity: 1 })
    asBuyer(buyerBId)

    const r = await getCheckoutSessionStatus(sessionId)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("NOT_FOUND")
  })

  it("status: nonexistent session id → NOT_FOUND", async () => {
    asBuyer(buyerAId)
    const r = await getCheckoutSessionStatus(randomUUID())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("NOT_FOUND")
  })

  it("status: unauthenticated → UNAUTHENTICATED", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await getCheckoutSessionStatus(randomUUID())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("UNAUTHENTICATED")
  })
})
