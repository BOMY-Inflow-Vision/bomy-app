/**
 * Integration tests — initiateCheckout (PR #31 Tasks 11 + 12).
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *   DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *   BOMY_RLS_READY=1 pnpm --filter @bomy/web test initiate.test.ts
 *
 * Covers spec §6.2 tests 14-27. Phase 1 (Task 11) + Phase 1b HitPay redirect
 * and PSP-ref compensation triggers (Task 12).
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@bomy/hitpay", async (importActual) => {
  // Preserve the real error classes — actions.ts uses `instanceof HitPayError`
  // when shortening error codes for the audit-row reason.
  const actual = await importActual<typeof HitPayModule>()
  return { ...actual, HitPayClient: vi.fn() }
})

import { auth } from "@/auth"
import { HitPayClient, HitPayValidationError } from "@bomy/hitpay"
import type * as HitPayModule from "@bomy/hitpay"

import { initiateCheckout } from "../../src/app/checkout/actions"
import { compensateInitiation } from "../../src/app/checkout/compensate"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const MockHitPayClient = HitPayClient as unknown as Mock

const DEFAULT_PR_ID = "pr-test-default"
const DEFAULT_PR_URL = `https://securecheckout.hit-pay.com/${DEFAULT_PR_ID}`

function defaultHitPaySuccessMock() {
  return vi.fn().mockResolvedValue({ id: DEFAULT_PR_ID, url: DEFAULT_PR_URL })
}

const VALID_ADDRESS = {
  name: "Ali Ahmad",
  phone: "+60123456789",
  line1: "123 Jalan Merdeka",
  city: "Kuala Lumpur",
  postcode: "50000",
  state: "Kuala Lumpur",
  country: "MY",
} as const

describe.skipIf(!shouldRun)("initiateCheckout", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerAId: string
  let buyerBId: string
  let sellerId: string
  let storeId: string
  let productId: string
  let variantId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    // Phase 1b env vars — actions.ts throws clearly if absent.
    process.env["HITPAY_API_KEY"] = "test-api-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    process.env["WEB_BASE_URL"] = "http://localhost:3000"
    process.env["API_BASE_URL"] = "http://localhost:3001"
    testDb = makeDb({ url: DATABASE_URL as string })

    buyerAId = randomUUID()
    buyerBId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    productId = randomUUID()
    variantId = randomUUID()

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "initiate test seed" },
      async (tx) => {
        await tx.insert(schema.users).values([
          { id: buyerAId, email: `${buyerAId}@test.bomy`, role: "buyer" },
          { id: buyerBId, email: `${buyerBId}@test.bomy`, role: "buyer" },
          { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
        ])
        await tx.insert(schema.stores).values({
          id: storeId,
          ownerId: sellerId,
          name: "Initiate Store",
          slug: `init-${storeId}`,
          status: "active",
          flatShippingFeeSen: 500n,
        })
        await tx.insert(schema.products).values({
          id: productId,
          storeId,
          name: "Initiate Product",
          slug: `init-${productId}`,
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
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "initiate test teardown" },
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
        await tx
          .update(schema.platformConfig)
          .set({ value: false })
          .where(eq(schema.platformConfig.key, "checkout_enabled"))
      },
    )
    await testDb.close()
  })

  beforeEach(async () => {
    mockAuth.mockReset()
    // Default HitPay mock: every initiation succeeds and returns the same
    // stable checkout URL. Failure-path tests override via
    // MockHitPayClient.mockImplementation in the test body.
    MockHitPayClient.mockReset()
    MockHitPayClient.mockImplementation(() => ({
      createPaymentRequest: defaultHitPaySuccessMock(),
    }))
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "initiate test reset" },
      async (tx) => {
        await tx.delete(schema.inventoryReservations)
        await tx.delete(schema.checkoutSessionItems)
        await tx.delete(schema.checkoutSessionStores)
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerAId))
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerBId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerAId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.userId, buyerBId))
        // Restore variant stock + active flags so previous tests don't leak state
        await tx
          .update(schema.productVariants)
          .set({ stockCount: 10, isActive: true })
          .where(eq(schema.productVariants.id, variantId))
        await tx
          .update(schema.products)
          .set({ status: "active" })
          .where(eq(schema.products.id, productId))
        await tx
          .update(schema.stores)
          .set({ status: "active" })
          .where(eq(schema.stores.id, storeId))
        // Reset checkout_enabled to true for all tests except the disabled one
        await tx
          .update(schema.platformConfig)
          .set({ value: true })
          .where(eq(schema.platformConfig.key, "checkout_enabled"))
      },
    )
  })

  function asBuyer(id: string) {
    mockAuth.mockResolvedValue({ user: { id, role: "buyer" } })
  }

  async function latestSessionIdFor(userId: string): Promise<string> {
    return withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test find latest session" },
      async (tx) => {
        const rows = await tx
          .select({ id: schema.checkoutSessions.id })
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.userId, userId))
          .orderBy(desc(schema.checkoutSessions.createdAt))
          .limit(1)
        return rows[0]!.id
      },
    )
  }

  async function countCheckoutTables(): Promise<{
    sessions: number
    items: number
    stores: number
    reservations: number
  }> {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test count" }, async (tx) => {
      const s = await tx.select({ c: sql<number>`count(*)::int` }).from(schema.checkoutSessions)
      const i = await tx.select({ c: sql<number>`count(*)::int` }).from(schema.checkoutSessionItems)
      const st = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.checkoutSessionStores)
      const r = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.inventoryReservations)
      return {
        sessions: Number(s[0]!.c),
        items: Number(i[0]!.c),
        stores: Number(st[0]!.c),
        reservations: Number(r[0]!.c),
      }
    })
  }

  // ─── 14: CHECKOUT_DISABLED — no side effects ─────────────────────────

  it("checkout_enabled=false returns CHECKOUT_DISABLED with no side effects", async () => {
    asBuyer(buyerAId)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "disable" }, async (tx) => {
      await tx
        .update(schema.platformConfig)
        .set({ value: false })
        .where(eq(schema.platformConfig.key, "checkout_enabled"))
    })
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("CHECKOUT_DISABLED")
    const after = await countCheckoutTables()
    expect(after).toEqual(before)
  })

  // ─── 15: happy path ──────────────────────────────────────────────────

  it("happy path: session+items+stores+reservations inserted; stock decremented; voucher reserved; audit row written; HitPay payload correct", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed voucher" }, async (tx) => {
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerAId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 1000n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      })
    })

    // Capture the createPaymentRequest call args so we can assert on
    // the HitPay payload below (amount/currency/refs/urls).
    const createPaymentRequest = vi
      .fn()
      .mockResolvedValue({ id: DEFAULT_PR_ID, url: DEFAULT_PR_URL })
    MockHitPayClient.mockImplementation(() => ({ createPaymentRequest }))

    const auditBefore = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test count audit" },
      async (tx) => tx.select({ c: sql<number>`count(*)::int` }).from(schema.adminBypassAudit),
    )
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 2 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Phase 1b redirects to HitPay's checkout URL (not the placeholder).
    expect(r.redirectUrl).toBe(DEFAULT_PR_URL)

    const sessionId = await latestSessionIdFor(buyerAId)

    // HitPay payload — guard the contract Phase 1b ships to the PSP.
    expect(createPaymentRequest).toHaveBeenCalledOnce()
    const arg = createPaymentRequest.mock.calls[0]?.[0] as {
      amount: string
      currency: string
      reference_number: string
      redirect_url: string
      cancel_url: string
      webhook: string
      purpose: string
    }
    expect(arg.amount).toBe("95.00") // 9500 sen → "95.00"
    expect(arg.currency).toBe("MYR")
    expect(arg.reference_number).toBe(sessionId)
    expect(arg.redirect_url).toBe(`http://localhost:3000/checkout/success?session=${sessionId}`)
    expect(arg.cancel_url).toBe(`http://localhost:3000/checkout/cancelled?session=${sessionId}`)
    expect(arg.webhook).toBe("http://localhost:3001/webhooks/hitpay")
    expect(arg.purpose).toMatch(/^BOMY order #/)

    // Verify session row
    const sessionRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read session" },
      async (tx) =>
        tx.select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId)),
    )
    expect(sessionRows).toHaveLength(1)
    const sess = sessionRows[0]!
    expect(sess.userId).toBe(buyerAId)
    expect(sess.status).toBe("pending_payment")
    expect(sess.pspProvider).toBe("hitpay")
    expect(sess.voucherId).toBe(voucherId)
    expect(sess.totalCatalogSen).toBe(10000n) // 2 * 5000
    expect(sess.totalShippingSen).toBe(500n)
    expect(sess.voucherDiscountSen).toBe(1000n)
    expect(sess.brandDiscountTotalSen).toBe(0n) // voucher suppresses
    expect(sess.totalBuyerPaysSen).toBe(9500n) // 10000 + 500 - 1000
    // Phase 1b: PSP ref persisted by Transaction 2.
    expect(sess.pspPaymentRequestId).toBe(DEFAULT_PR_ID)
    expect(sess.pspPaymentUrl).toBe(DEFAULT_PR_URL)

    // Items / stores / reservations
    const items = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "r" }, async (tx) =>
      tx
        .select()
        .from(schema.checkoutSessionItems)
        .where(eq(schema.checkoutSessionItems.checkoutSessionId, sessionId)),
    )
    expect(items).toHaveLength(1)
    expect(items[0]!.quantity).toBe(2)
    expect(items[0]!.unitPriceSen).toBe(5000n)
    expect(items[0]!.lineTotalSen).toBe(10000n)

    const stores = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "r" }, async (tx) =>
      tx
        .select()
        .from(schema.checkoutSessionStores)
        .where(eq(schema.checkoutSessionStores.checkoutSessionId, sessionId)),
    )
    expect(stores).toHaveLength(1)
    expect(stores[0]!.retailSubtotalSen).toBe(10000n)
    expect(stores[0]!.voucherContributionSen).toBe(1000n)
    expect(stores[0]!.shippingFeeSen).toBe(500n)

    const reservations = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "r" },
      async (tx) =>
        tx
          .select()
          .from(schema.inventoryReservations)
          .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId)),
    )
    expect(reservations).toHaveLength(1)
    expect(reservations[0]!.quantity).toBe(2)
    expect(reservations[0]!.status).toBe("active")

    // Stock decremented
    const variantRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "r" },
      async (tx) =>
        tx.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)),
    )
    expect(variantRows[0]!.stockCount).toBe(8) // 10 - 2

    // Voucher reserved
    const voucherRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "r" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.id, voucherId)),
    )
    expect(voucherRows[0]!.reservedCheckoutSessionId).toBe(sessionId)
    expect(voucherRows[0]!.reservedAt).not.toBeNull()
    expect(voucherRows[0]!.redeemedAt).toBeNull()

    // At least one new audit row (checkout_enabled read + initiation = 2)
    const auditAfter = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test count audit" },
      async (tx) => tx.select({ c: sql<number>`count(*)::int` }).from(schema.adminBypassAudit),
    )
    expect(Number(auditAfter[0]!.c)).toBeGreaterThan(Number(auditBefore[0]!.c))

    // Initiation-specific audit row exists with the sessionId in reason
    const initRow = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test find audit" },
      async (tx) =>
        tx
          .select()
          .from(schema.adminBypassAudit)
          .where(eq(schema.adminBypassAudit.reason, `checkout_initiation:${sessionId}`)),
    )
    expect(initRow).toHaveLength(1)
  })

  // ─── 16-20: validation failures (no side effects) ────────────────────

  it("empty cart returns EMPTY_CART", async () => {
    asBuyer(buyerAId)
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("EMPTY_CART")
    expect(await countCheckoutTables()).toEqual(before)
  })

  it("INVALID_CART when variant inactive", async () => {
    asBuyer(buyerAId)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "deactivate" }, async (tx) => {
      await tx
        .update(schema.productVariants)
        .set({ isActive: false })
        .where(eq(schema.productVariants.id, variantId))
    })
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("INVALID_CART")
      const lines = r.details?.["invalidLines"] as Array<{ variantId: string; reason: string }>
      expect(lines[0]!.reason).toBe("variant_inactive")
    }
    expect(await countCheckoutTables()).toEqual(before)
  })

  it("INVALID_CART when product archived", async () => {
    asBuyer(buyerAId)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "archive" }, async (tx) => {
      await tx
        .update(schema.products)
        .set({ status: "archived" })
        .where(eq(schema.products.id, productId))
    })
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("INVALID_CART")
      const lines = r.details?.["invalidLines"] as Array<{ variantId: string; reason: string }>
      expect(lines[0]!.reason).toBe("product_not_active")
    }
  })

  it("INVALID_CART when store suspended", async () => {
    asBuyer(buyerAId)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "suspend" }, async (tx) => {
      await tx
        .update(schema.stores)
        .set({ status: "suspended" })
        .where(eq(schema.stores.id, storeId))
    })
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("INVALID_CART")
      const lines = r.details?.["invalidLines"] as Array<{ variantId: string; reason: string }>
      expect(lines[0]!.reason).toBe("store_not_active")
    }
  })

  it("INVALID_CART when stock < requested", async () => {
    asBuyer(buyerAId)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "low stock" }, async (tx) => {
      await tx
        .update(schema.productVariants)
        .set({ stockCount: 1 })
        .where(eq(schema.productVariants.id, variantId))
    })
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 5 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("INVALID_CART")
      const lines = r.details?.["invalidLines"] as Array<{ variantId: string; reason: string }>
      expect(lines[0]!.reason).toBe("insufficient_stock")
    }
  })

  it("INVALID_ADDRESS rejects bad MY phone format", async () => {
    asBuyer(buyerAId)
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: { ...VALID_ADDRESS, phone: "1234" },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("INVALID_ADDRESS")
      const fieldErrors = r.details?.["fieldErrors"] as Record<string, string>
      expect(fieldErrors["phone"]).toBeDefined()
    }
  })

  // ─── 22: PENDING_CHECKOUT_EXISTS ─────────────────────────────────────

  it("PENDING_CHECKOUT_EXISTS returns existing sessionId when buyer has unexpired pending session", async () => {
    asBuyer(buyerAId)
    // First initiation succeeds
    const r1 = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    const sessionId1 = await latestSessionIdFor(buyerAId)

    // Second initiation surfaces the existing one
    const r2 = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r2.ok).toBe(false)
    if (!r2.ok) {
      expect(r2.error).toBe("PENDING_CHECKOUT_EXISTS")
      expect(r2.details?.["sessionId"]).toBe(sessionId1)
    }
  })

  // ─── 23: TOTAL_NOT_PAYABLE ───────────────────────────────────────────

  it("TOTAL_NOT_PAYABLE when voucher covers catalog and shipping is zero", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "free ship + big voucher" },
      async (tx) => {
        await tx
          .update(schema.stores)
          .set({ flatShippingFeeSen: 0n })
          .where(eq(schema.stores.id, storeId))
        await tx.insert(schema.vouchers).values({
          id: voucherId,
          userId: buyerAId,
          code: `vc-${voucherId}`,
          type: "fixed_myr",
          fixedAmountSen: 99999n,
          issuedMonth: "2026-05",
          expiresAt: new Date(Date.now() + 30 * 86400_000),
        })
      },
    )
    try {
      const before = await countCheckoutTables()
      const r = await initiateCheckout({
        items: [{ variantId, quantity: 1 }],
        voucherId,
        shippingAddress: VALID_ADDRESS,
      })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe("TOTAL_NOT_PAYABLE")
      // Transaction rolled back — no rows written
      expect(await countCheckoutTables()).toEqual(before)
    } finally {
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "restore ship" }, async (tx) => {
        await tx
          .update(schema.stores)
          .set({ flatShippingFeeSen: 500n })
          .where(eq(schema.stores.id, storeId))
      })
    }
  })

  // ─── 24: stock race — two different buyers, last unit ────────────────

  it("stock race: two buyers initiate concurrently for the last unit — one wins, other OUT_OF_STOCK_RACE", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "set stock=1" }, async (tx) => {
      await tx
        .update(schema.productVariants)
        .set({ stockCount: 1 })
        .where(eq(schema.productVariants.id, variantId))
    })

    // FIFO call ordering — Promise.all kicks off both calls in source order,
    // so the first auth() lookup gets buyerA and the second gets buyerB.
    mockAuth
      .mockResolvedValueOnce({ user: { id: buyerAId, role: "buyer" } })
      .mockResolvedValueOnce({ user: { id: buyerBId, role: "buyer" } })

    const [r1, r2] = await Promise.all([
      initiateCheckout({
        items: [{ variantId, quantity: 1 }],
        voucherId: null,
        shippingAddress: VALID_ADDRESS,
      }),
      initiateCheckout({
        items: [{ variantId, quantity: 1 }],
        voucherId: null,
        shippingAddress: VALID_ADDRESS,
      }),
    ])

    const okCount = [r1, r2].filter((r) => r.ok).length
    const failed = [r1, r2].find((r) => !r.ok)
    expect(okCount).toBe(1)
    expect(failed).toBeDefined()
    if (failed && !failed.ok) {
      // Either OUT_OF_STOCK_RACE (got the lock, lost the decrement) or
      // INVALID_CART/insufficient_stock (validation saw stock=0). Both are
      // valid; the gate is "no double-sale". Stock must end at 0.
      expect(["OUT_OF_STOCK_RACE", "INVALID_CART"]).toContain(failed.error)
    }

    const variantRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "r" },
      async (tx) =>
        tx.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)),
    )
    expect(variantRows[0]!.stockCount).toBe(0)

    const sessions = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "r" }, async (tx) =>
      tx
        .select()
        .from(schema.checkoutSessions)
        .where(
          and(
            eq(schema.checkoutSessions.status, "pending_payment"),
            inArray(schema.checkoutSessions.userId, [buyerAId, buyerBId]),
          ),
        ),
    )
    expect(sessions).toHaveLength(1)
  })

  // ─── Bob R13: VOUCHER_UNAVAILABLE coverage ───────────────────────────
  // Each filter in loadContextForInitiation's SELECT must reject the voucher;
  // the resulting null voucher must surface as VOUCHER_UNAVAILABLE (not
  // silently dropped) and roll back any partial state.

  it("VOUCHER_UNAVAILABLE when voucher belongs to a different buyer", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed B voucher" }, async (tx) => {
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerBId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 500n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      })
    })
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("VOUCHER_UNAVAILABLE")
    expect(await countCheckoutTables()).toEqual(before)
  })

  it("VOUCHER_UNAVAILABLE when voucher is expired", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed expired" }, async (tx) => {
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerAId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 500n,
        issuedMonth: "2026-04",
        expiresAt: new Date(Date.now() - 86400_000),
      })
    })
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("VOUCHER_UNAVAILABLE")
    expect(await countCheckoutTables()).toEqual(before)
  })

  it("VOUCHER_UNAVAILABLE when voucher is already redeemed", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed redeemed" }, async (tx) => {
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerAId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 500n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86400_000),
        redeemedAt: new Date(Date.now() - 3600_000),
      })
    })
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("VOUCHER_UNAVAILABLE")
    expect(await countCheckoutTables()).toEqual(before)
  })

  it("VOUCHER_UNAVAILABLE when voucher is already reserved to another session", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    const otherSessionId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed reserved" }, async (tx) => {
      // Ephemeral non-pending session so it doesn't trip single-pending guard;
      // it only exists to satisfy the voucher.reserved_checkout_session_id FK.
      await tx.insert(schema.checkoutSessions).values({
        id: otherSessionId,
        userId: buyerAId,
        status: "cancelled",
        pspProvider: "hitpay",
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 1000n,
        totalShippingSen: 0n,
        voucherDiscountSen: 0n,
        brandDiscountTotalSen: 0n,
        totalBuyerPaysSen: 1000n,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      })
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerAId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 500n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86400_000),
        reservedCheckoutSessionId: otherSessionId,
        reservedAt: new Date(Date.now() - 60_000),
      })
    })
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("VOUCHER_UNAVAILABLE")
    // before snapshot has the seeded session; after must equal it (no NEW rows)
    expect(await countCheckoutTables()).toEqual(before)
  })

  // ─── 25a: seam-level voucher reservation race ────────────────────────

  it("seam-level voucher reservation race: only one of two concurrent UPDATEs succeeds", async () => {
    const voucherId = randomUUID()
    const sessionId1 = randomUUID()
    const sessionId2 = randomUUID()

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "seed voucher + 2 sessions" },
      async (tx) => {
        await tx.insert(schema.vouchers).values({
          id: voucherId,
          userId: buyerAId,
          code: `vc-${voucherId}`,
          type: "fixed_myr",
          fixedAmountSen: 500n,
          issuedMonth: "2026-05",
          expiresAt: new Date(Date.now() + 30 * 86400_000),
        })
        await tx.insert(schema.checkoutSessions).values([
          {
            id: sessionId1,
            userId: buyerAId,
            status: "pending_payment",
            pspProvider: "hitpay",
            shippingAddress: VALID_ADDRESS,
            totalCatalogSen: 1000n,
            totalShippingSen: 0n,
            voucherDiscountSen: 0n,
            brandDiscountTotalSen: 0n,
            totalBuyerPaysSen: 1000n,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
          {
            id: sessionId2,
            userId: buyerAId,
            status: "pending_payment",
            pspProvider: "hitpay",
            shippingAddress: VALID_ADDRESS,
            totalCatalogSen: 1000n,
            totalShippingSen: 0n,
            voucherDiscountSen: 0n,
            brandDiscountTotalSen: 0n,
            totalBuyerPaysSen: 1000n,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        ])
      },
    )

    async function tryReserve(targetSessionId: string): Promise<number> {
      const rows = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: `seam reserve ${targetSessionId}` },
        async (tx) =>
          tx
            .update(schema.vouchers)
            .set({ reservedCheckoutSessionId: targetSessionId, reservedAt: new Date() })
            .where(
              and(
                eq(schema.vouchers.id, voucherId),
                eq(schema.vouchers.userId, buyerAId),
                sql`${schema.vouchers.redeemedAt} IS NULL`,
                sql`${schema.vouchers.reservedCheckoutSessionId} IS NULL`,
                sql`${schema.vouchers.expiresAt} > now()`,
              ),
            )
            .returning({ id: schema.vouchers.id }),
      )
      return rows.length
    }

    const [r1, r2] = await Promise.all([tryReserve(sessionId1), tryReserve(sessionId2)])
    expect(r1 + r2).toBe(1)

    const v = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "r" }, async (tx) =>
      tx.select().from(schema.vouchers).where(eq(schema.vouchers.id, voucherId)),
    )
    expect(v[0]!.reservedCheckoutSessionId).toBeTruthy()
    expect([sessionId1, sessionId2]).toContain(v[0]!.reservedCheckoutSessionId)
  })

  // ─── 25b: same-buyer voucher retry → PENDING_CHECKOUT_EXISTS, not VOUCHER_RACE ──

  it("same-buyer second call with same voucher returns PENDING_CHECKOUT_EXISTS (single-pending preempts VOUCHER_RACE)", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed voucher" }, async (tx) => {
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerAId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 500n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      })
    })

    const r1 = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r1.ok).toBe(true)

    const r2 = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toBe("PENDING_CHECKOUT_EXISTS")
  })

  // ─── Auth gate ───────────────────────────────────────────────────────

  it("UNAUTHENTICATED when no session", async () => {
    mockAuth.mockResolvedValue(null)
    const before = await countCheckoutTables()
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("UNAUTHENTICATED")
    expect(await countCheckoutTables()).toEqual(before)
  })

  // ─── Buyer SELECT under withTenant works for own session ─────────────

  it("buyer can SELECT own checkout_session under withTenant after a successful initiation", async () => {
    asBuyer(buyerAId)
    const r = await initiateCheckout({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
      shippingAddress: VALID_ADDRESS,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sessionId = await latestSessionIdFor(buyerAId)

    const rows = await withTenant(testDb.db, { userId: buyerAId, userRole: "buyer" }, async (tx) =>
      tx
        .select({ id: schema.checkoutSessions.id, status: schema.checkoutSessions.status })
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.id, sessionId)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("pending_payment")
  })

  // ─── Phase 1b: HitPay redirect + PSP-ref persistence ─────────────────
  // Tests 26 + 27 from spec §6.2. The action must roll back Phase 1's
  // side effects whenever Phase 1b fails: stock restored, voucher
  // released, reservations released, session cancelled, audit row trail
  // (initiation + compensation) preserved.

  // ─── 26: createPaymentRequest throws → full compensation ─────────────

  it("HitPay createPaymentRequest throws → compensation runs; session cancelled; stock restored; voucher released; PAYMENT_INIT_FAILED returned", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed voucher" }, async (tx) => {
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerAId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 1000n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      })
    })

    // Override default success mock with a HitPay validation failure.
    const createPaymentRequest = vi
      .fn()
      .mockRejectedValue(new HitPayValidationError({ error: "amount must be positive" }))
    MockHitPayClient.mockImplementation(() => ({ createPaymentRequest }))

    const r = await initiateCheckout({
      items: [{ variantId, quantity: 2 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("PAYMENT_INIT_FAILED")
    expect(createPaymentRequest).toHaveBeenCalledOnce()

    // Session created by Phase 1 must now be cancelled.
    const sessionId = await latestSessionIdFor(buyerAId)
    const sessionRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read session" },
      async (tx) =>
        tx.select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId)),
    )
    expect(sessionRows).toHaveLength(1)
    expect(sessionRows[0]!.status).toBe("cancelled")
    // PSP fields must not be set — Phase 1b T2 never ran.
    expect(sessionRows[0]!.pspPaymentRequestId).toBeNull()
    expect(sessionRows[0]!.pspPaymentUrl).toBeNull()

    // Reservations released.
    const reservations = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read reservations" },
      async (tx) =>
        tx
          .select()
          .from(schema.inventoryReservations)
          .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId)),
    )
    expect(reservations).toHaveLength(1)
    expect(reservations[0]!.status).toBe("released")

    // Stock restored.
    const variantRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read variant" },
      async (tx) =>
        tx.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)),
    )
    expect(variantRows[0]!.stockCount).toBe(10)

    // Voucher fully released (not redeemed).
    const voucherRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read voucher" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.id, voucherId)),
    )
    expect(voucherRows[0]!.reservedCheckoutSessionId).toBeNull()
    expect(voucherRows[0]!.reservedAt).toBeNull()
    expect(voucherRows[0]!.redeemedAt).toBeNull()

    // Audit trail: initiation row + compensation row for this session both exist.
    const initRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test find init audit" },
      async (tx) =>
        tx
          .select()
          .from(schema.adminBypassAudit)
          .where(eq(schema.adminBypassAudit.reason, `checkout_initiation:${sessionId}`)),
    )
    expect(initRows).toHaveLength(1)

    const compRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test find compensation audit" },
      async (tx) =>
        tx
          .select()
          .from(schema.adminBypassAudit)
          .where(
            sql`${schema.adminBypassAudit.reason} LIKE ${`checkout_compensation:hitpay_create_failed%:${sessionId}`}`,
          ),
    )
    expect(compRows).toHaveLength(1)
  })

  // ─── 27: PSP-ref UPDATE returns 0 rows → compensation runs (no-op) ───
  //
  // Models a concurrent cancellation (e.g. expiry job, buyer cancel) that
  // flips the session out of pending_payment after Phase 1 commits but
  // before Phase 1b T2's row-count-guarded UPDATE runs. The action's own
  // compensation no-ops (state already cancelled) — but the audit row from
  // its withAdmin envelope is still written.

  it("PSP-ref UPDATE returns 0 rows when session is concurrently cancelled → PAYMENT_INIT_FAILED with state already cleaned up", async () => {
    asBuyer(buyerAId)
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed voucher" }, async (tx) => {
      await tx.insert(schema.vouchers).values({
        id: voucherId,
        userId: buyerAId,
        code: `vc-${voucherId}`,
        type: "fixed_myr",
        fixedAmountSen: 1000n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      })
    })

    // Stub: HitPay succeeds, but BEFORE returning, the test driver runs
    // compensateInitiation as a concurrent process would — fully cancelling
    // the session and releasing reservations/stock/voucher. The action's
    // Phase 1b T2 UPDATE then returns 0 rows and triggers its own
    // (no-op) compensation.
    const createPaymentRequest = vi.fn().mockImplementation(async () => {
      const sid = await latestSessionIdFor(buyerAId)
      await compensateInitiation(testDb.db, {
        sessionId: sid,
        buyerId: buyerAId,
        reason: "test_concurrent_cancel",
      })
      return { id: "pr-test-27", url: "https://securecheckout.hit-pay.com/pr-test-27" }
    })
    MockHitPayClient.mockImplementation(() => ({ createPaymentRequest }))

    const r = await initiateCheckout({
      items: [{ variantId, quantity: 2 }],
      voucherId,
      shippingAddress: VALID_ADDRESS,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("PAYMENT_INIT_FAILED")

    const sessionId = await latestSessionIdFor(buyerAId)
    const sessionRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read session" },
      async (tx) =>
        tx.select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId)),
    )
    expect(sessionRows[0]!.status).toBe("cancelled")
    expect(sessionRows[0]!.pspPaymentRequestId).toBeNull()
    expect(sessionRows[0]!.pspPaymentUrl).toBeNull()

    const reservations = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read reservations" },
      async (tx) =>
        tx
          .select()
          .from(schema.inventoryReservations)
          .where(eq(schema.inventoryReservations.checkoutSessionId, sessionId)),
    )
    expect(reservations[0]!.status).toBe("released")

    const variantRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read variant" },
      async (tx) =>
        tx.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)),
    )
    expect(variantRows[0]!.stockCount).toBe(10)

    const voucherRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read voucher" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.id, voucherId)),
    )
    expect(voucherRows[0]!.reservedCheckoutSessionId).toBeNull()
    expect(voucherRows[0]!.reservedAt).toBeNull()
    expect(voucherRows[0]!.redeemedAt).toBeNull()

    // Audit rows: initiation, the in-mock test_concurrent_cancel compensation,
    // and the action's own no-op store_psp_ref_zero_rows compensation envelope.
    const initRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test find init audit" },
      async (tx) =>
        tx
          .select()
          .from(schema.adminBypassAudit)
          .where(eq(schema.adminBypassAudit.reason, `checkout_initiation:${sessionId}`)),
    )
    expect(initRows).toHaveLength(1)

    const zeroRowsCompRows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test find zero-rows audit" },
      async (tx) =>
        tx
          .select()
          .from(schema.adminBypassAudit)
          .where(
            eq(
              schema.adminBypassAudit.reason,
              `checkout_compensation:store_psp_ref_zero_rows:${sessionId}`,
            ),
          ),
    )
    expect(zeroRowsCompRows).toHaveLength(1)
  })
})
