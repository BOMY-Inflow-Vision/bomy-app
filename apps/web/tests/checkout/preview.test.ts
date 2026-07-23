/**
 * Integration tests — priceCheckoutPreview server action.
 *
 * Requires a live Postgres with bomy_app role and applied migrations.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/web test
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { auth } from "@/auth"

import { priceCheckoutPreview } from "../../src/app/checkout/actions"
import { ACTION_RATE_LIMITS } from "../../src/lib/rate-limits"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("priceCheckoutPreview", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerAId: string
  let buyerBId: string
  let sellerId: string
  let storeId: string
  let productId: string
  let variantId: string
  let planId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })

    buyerAId = randomUUID()
    buyerBId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    productId = randomUUID()
    variantId = randomUUID()
    planId = randomUUID()

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "preview test seed" },
      async (tx) => {
        await tx.insert(schema.users).values([
          { id: buyerAId, email: `${buyerAId}@test.bomy`, role: "buyer" },
          { id: buyerBId, email: `${buyerBId}@test.bomy`, role: "buyer" },
          { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
        ])
        await tx.insert(schema.stores).values({
          id: storeId,
          ownerId: sellerId,
          name: "Preview Store",
          slug: `preview-${storeId}`,
          status: "active",
          flatShippingFeeSen: 500n,
        })
        await tx.insert(schema.products).values({
          id: productId,
          storeId,
          name: "Preview Product",
          slug: `prev-${productId}`,
          status: "active",
        })
        await tx.insert(schema.productVariants).values({
          id: variantId,
          productId,
          name: "M",
          priceMyrSen: 5000n,
          stockCount: 100,
          isActive: true,
        })
        await tx.insert(schema.brandSubscriptionPlans).values({
          id: planId,
          storeId,
          termMonths: 12,
          priceMyrSen: 10000n,
          discountPct: 10,
          isActive: true,
        })
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "preview test teardown" },
      async (tx) => {
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerAId))
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerBId))
        await tx
          .delete(schema.brandSubscriptions)
          .where(eq(schema.brandSubscriptions.userId, buyerAId))
        await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, variantId))
        await tx.delete(schema.products).where(eq(schema.products.id, productId))
        await tx
          .delete(schema.brandSubscriptionPlans)
          .where(eq(schema.brandSubscriptionPlans.id, planId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerAId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerBId))
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
      },
    )
    await testDb.close()
  })

  beforeEach(async () => {
    // Reset auth mock + buyer-owned vouchers/brand_subs between tests.
    mockAuth.mockReset()
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "preview test reset" },
      async (tx) => {
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerAId))
        await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, buyerBId))
        await tx
          .delete(schema.brandSubscriptions)
          .where(eq(schema.brandSubscriptions.userId, buyerAId))
        // priceCheckoutPreview is rate-limited (GAPS #3); this file calls it
        // many times per test against fixed buyer ids across many tests.
        await tx
          .delete(schema.actionRateLimits)
          .where(inArray(schema.actionRateLimits.userId, [buyerAId, buyerBId]))
        // Restore variant stock
        await tx
          .update(schema.productVariants)
          .set({ stockCount: 100, isActive: true })
          .where(eq(schema.productVariants.id, variantId))
        await tx
          .update(schema.products)
          .set({ status: "active" })
          .where(eq(schema.products.id, productId))
      },
    )
  })

  function asBuyerA() {
    mockAuth.mockResolvedValue({ user: { id: buyerAId, role: "buyer" } })
  }

  // ─── basic flows ─────────────────────────────────────────────────────

  it("UNAUTHENTICATED when no session", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await priceCheckoutPreview({ items: [{ variantId, quantity: 1 }], voucherId: null })
    expect(r.ok).toBe(false)
    if (!r.ok && r.error === "UNAUTHENTICATED") expect(true).toBe(true)
    else expect.fail(`expected UNAUTHENTICATED, got ${JSON.stringify(r)}`)
  })

  it("EMPTY_CART when no items", async () => {
    asBuyerA()
    const r = await priceCheckoutPreview({ items: [], voucherId: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("EMPTY_CART")
  })

  it("happy path: 1 store, no voucher, no brand sub → correct totals", async () => {
    asBuyerA()
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 2 }],
      voucherId: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.totalCatalogSen).toBe("10000") // 2 * 5000
    expect(r.totalShippingSen).toBe("500")
    expect(r.totalBuyerPaysSen).toBe("10500")
    expect(r.brandDiscountTotalSen).toBe("0")
    expect(r.voucherDiscountSen).toBe("0")
    expect(r.storeRows).toHaveLength(1)
    expect(r.storeRows[0]!.shippingFeeSen).toBe("500")
  })

  it("brand discount auto-applies when buyer has active sub (uses snapshotted discount_pct)", async () => {
    asBuyerA()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed active sub" }, async (tx) => {
      await tx.insert(schema.brandSubscriptions).values({
        userId: buyerAId,
        storeId,
        planId,
        status: "active",
        priceMyrSen: 10000n,
        discountPct: 10, // snapshot
        periodStart: new Date(Date.now() - 86400_000),
        periodEnd: new Date(Date.now() + 86400_000),
        hitpayFeeSen: 0n,
        bomyCommissionSen: 1000n,
        brandPayoutSen: 9000n,
      })
    })
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 1 * 5000 = 5000 catalog; 10% off = 500 brand discount
    expect(r.brandDiscountTotalSen).toBe("500")
    expect(r.totalCatalogSen).toBe("5000")
    expect(r.totalShippingSen).toBe("500")
    expect(r.totalBuyerPaysSen).toBe("5000") // 5000 + 500 - 500 = 5000
    expect(r.storeRows[0]!.discountedSubtotalSen).toBe("4500")
  })

  it("brand discount = 0 when sub status = pending", async () => {
    asBuyerA()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed pending sub" }, async (tx) => {
      await tx.insert(schema.brandSubscriptions).values({
        userId: buyerAId,
        storeId,
        planId,
        status: "pending",
        priceMyrSen: 10000n,
        discountPct: 10,
        periodStart: new Date(Date.now() - 86400_000),
        periodEnd: new Date(Date.now() + 86400_000),
        bomyCommissionSen: 0n,
        brandPayoutSen: 0n,
      })
    })
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.brandDiscountTotalSen).toBe("0")
  })

  it("voucher suppresses brand discount", async () => {
    asBuyerA()
    const voucherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed voucher" }, async (tx) => {
      await tx.insert(schema.brandSubscriptions).values({
        userId: buyerAId,
        storeId,
        planId,
        status: "active",
        priceMyrSen: 10000n,
        discountPct: 10,
        periodStart: new Date(Date.now() - 86400_000),
        periodEnd: new Date(Date.now() + 86400_000),
        hitpayFeeSen: 0n,
        bomyCommissionSen: 1000n,
        brandPayoutSen: 9000n,
      })
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
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 1 }],
      voucherId,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.brandDiscountTotalSen).toBe("0")
    expect(r.voucherDiscountSen).toBe("1000")
    expect(r.voucherApplied).toBe(true)
  })

  it("INVALID_CART when variant inactive — includes invalidLines + availableVouchers", async () => {
    asBuyerA()
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "deactivate variant" },
      async (tx) => {
        await tx
          .update(schema.productVariants)
          .set({ isActive: false })
          .where(eq(schema.productVariants.id, variantId))
      },
    )
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("INVALID_CART")
    if (r.error === "INVALID_CART") {
      expect(r.invalidLines).toHaveLength(1)
      expect(r.invalidLines[0]!.variantId).toBe(variantId)
      // Under buyer RLS, inactive variants are filtered out by the SELECT
      // (the public-read policy hides them), so the reason surfaces as
      // "missing" rather than "variant_inactive". Both indicate the same
      // user-facing condition: the line is not buyable.
      expect(["missing", "variant_inactive"]).toContain(r.invalidLines[0]!.reason)
      expect(Array.isArray(r.availableVouchers)).toBe(true)
    }
  })

  it("TOTAL_NOT_PAYABLE when voucher covers catalog + shipping = 0", async () => {
    asBuyerA()
    const voucherId = randomUUID()
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "seed full voucher + free ship" },
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
      const r = await priceCheckoutPreview({
        items: [{ variantId, quantity: 1 }],
        voucherId,
      })
      expect(r.ok).toBe(false)
      if (!r.ok && r.error === "TOTAL_NOT_PAYABLE") expect(true).toBe(true)
      else expect.fail(`expected TOTAL_NOT_PAYABLE, got ${JSON.stringify(r)}`)
    } finally {
      await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "restore shipping" },
        async (tx) => {
          await tx
            .update(schema.stores)
            .set({ flatShippingFeeSen: 500n })
            .where(eq(schema.stores.id, storeId))
        },
      )
    }
  })

  it("duplicate variantId lines are aggregated; combined quantity over stock → insufficient_stock", async () => {
    asBuyerA()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "set low stock" }, async (tx) => {
      await tx
        .update(schema.productVariants)
        .set({ stockCount: 3 })
        .where(eq(schema.productVariants.id, variantId))
    })
    // 2 + 2 = 4 combined > stockCount=3. Per-line each 2 would pass.
    const r = await priceCheckoutPreview({
      items: [
        { variantId, quantity: 2 },
        { variantId, quantity: 2 },
      ],
      voucherId: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("INVALID_CART")
    if (r.error === "INVALID_CART") {
      expect(r.invalidLines).toHaveLength(1)
      expect(r.invalidLines[0]!.variantId).toBe(variantId)
      expect(r.invalidLines[0]!.reason).toBe("insufficient_stock")
    }
  })

  it("duplicate variantId aggregates within stock → valid; single item row with summed quantity", async () => {
    asBuyerA()
    const r = await priceCheckoutPreview({
      items: [
        { variantId, quantity: 2 },
        { variantId, quantity: 3 },
      ],
      voucherId: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 5 units total. 5 * 5000 = 25000 catalog + 500 shipping = 25500
    expect(r.totalCatalogSen).toBe("25000")
    expect(r.totalShippingSen).toBe("500")
    expect(r.totalBuyerPaysSen).toBe("25500")
    expect(r.itemRows).toHaveLength(1) // aggregated to one row
    expect(r.itemRows[0]!.quantity).toBe(5)
  })

  it("invalid quantity (0) → invalid_quantity in invalidLines", async () => {
    asBuyerA()
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 0 }],
      voucherId: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("INVALID_CART")
    if (r.error === "INVALID_CART") {
      expect(r.invalidLines).toHaveLength(1)
      expect(r.invalidLines[0]!.reason).toBe("invalid_quantity")
    }
  })

  it("invalid quantity (negative) → invalid_quantity in invalidLines", async () => {
    asBuyerA()
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: -3 }],
      voucherId: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    if (r.error === "INVALID_CART") expect(r.invalidLines[0]!.reason).toBe("invalid_quantity")
  })

  it("invalid quantity (fractional) → invalid_quantity in invalidLines", async () => {
    asBuyerA()
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 1.5 }],
      voucherId: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    if (r.error === "INVALID_CART") expect(r.invalidLines[0]!.reason).toBe("invalid_quantity")
  })

  it("invalid quantity (NaN) → invalid_quantity in invalidLines", async () => {
    asBuyerA()
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: Number.NaN }],
      voucherId: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    if (r.error === "INVALID_CART") expect(r.invalidLines[0]!.reason).toBe("invalid_quantity")
  })

  it("voucher owned by another buyer is rejected — INVALID_CART avoided; voucher just not applied", async () => {
    asBuyerA()
    const otherVoucherId = randomUUID()
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "seed other voucher" },
      async (tx) => {
        await tx.insert(schema.vouchers).values({
          id: otherVoucherId,
          userId: buyerBId,
          code: `other-${otherVoucherId}`,
          type: "fixed_myr",
          fixedAmountSen: 500n,
          issuedMonth: "2026-05",
          expiresAt: new Date(Date.now() + 30 * 86400_000),
        })
      },
    )
    const r = await priceCheckoutPreview({
      items: [{ variantId, quantity: 1 }],
      voucherId: otherVoucherId,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.voucherApplied).toBe(false)
      expect(r.voucherDiscountSen).toBe("0")
      expect(r.availableVouchers).toHaveLength(0) // buyerA has none
    }
  })

  it("rate-limits repeated calls past ACTION_RATE_LIMITS.checkoutPreview.max", async () => {
    asBuyerA()
    for (let i = 0; i < ACTION_RATE_LIMITS.checkoutPreview.max; i++) {
      const r = await priceCheckoutPreview({ items: [{ variantId, quantity: 1 }], voucherId: null })
      expect(r.ok).toBe(true)
    }
    const over = await priceCheckoutPreview({
      items: [{ variantId, quantity: 1 }],
      voucherId: null,
    })
    expect(over).toEqual({ ok: false, error: "RATE_LIMITED" })
  })
})
