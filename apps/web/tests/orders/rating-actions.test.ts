/**
 * rateProduct integration tests: eligibility (delivered / completed only), own-product, the 24-hour
 * change window, the cached aggregate, admin-removed ratings, variant-less items resolved through
 * product_snapshot, and the two concurrency races (same buyer twice; two buyers at once).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/web test rating-actions --run
 */
import { randomUUID } from "node:crypto"

import { and, eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, type Mock, vi } from "vitest"

import { makeDb, RATING_WINDOW_HOURS, schema, withAdmin, withTenant } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"

import { rateProduct } from "../../src/app/account/orders/[orderId]/rating-actions"
import { resolveRatableProduct } from "../../src/app/account/orders/rating-eligibility"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

const VALID_ADDRESS = {
  name: "Tester",
  phone: "+60123456789",
  line1: "1 Jalan Test",
  city: "Kuala Lumpur",
  postcode: "50000",
  state: "Kuala Lumpur",
  country: "MY",
}

const ORDER_SEED = {
  shippingAddress: VALID_ADDRESS,
  shippingFeeSen: 500n,
  retailSubtotalSen: 5000n,
  brandDiscountSen: 0n,
  discountedSubtotalSen: 5000n,
  voucherContributionSen: 0n,
  pspFeeAllocatedSen: 100n,
  bomyCommissionSen: 1350n,
  bomyCommissionPct: 25,
  sellerPayoutSen: 4050n,
  paymentStatus: "paid" as const,
}

type Status = "processing" | "shipped" | "delivered" | "completed" | "cancelled"

describe.skipIf(!shouldRun)("rateProduct", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerAId: string
  let buyerBId: string
  let buyerCId: string // owns storeC, also shops from the seller's store
  let sellerId: string
  let storeId: string
  let storeCId: string
  const trackedOrderIds = new Set<string>()
  const trackedSessionIds = new Set<string>()
  const trackedProductIds = new Set<string>()

  async function adminTx<T>(
    reason: string,
    fn: (tx: Parameters<Parameters<typeof withAdmin>[2]>[0]) => Promise<T>,
  ) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  function signIn(userId: string | null) {
    mockAuth.mockResolvedValue(userId ? { user: { id: userId, role: "buyer" } } : null)
  }

  async function seedProduct(
    inStoreId = storeId,
  ): Promise<{ productId: string; variantId: string }> {
    const productId = randomUUID()
    const variantId = randomUUID()
    await adminTx("seed product", async (tx) => {
      await tx.insert(schema.products).values({
        id: productId,
        storeId: inStoreId,
        name: "Rated Product",
        slug: `rated-${productId.slice(0, 8)}`,
        status: "active",
      })
      await tx.insert(schema.productVariants).values({
        id: variantId,
        productId,
        name: "Single",
        priceMyrSen: 5000n,
        stockCount: 10,
      })
    })
    trackedProductIds.add(productId)
    return { productId, variantId }
  }

  /** Seeds checkout session + order + one order item; returns the order item id. */
  async function seedItem(opts: {
    buyerId: string
    productId: string
    variantId: string | null
    status?: Status
    deliveredAt?: Date | null
    inStoreId?: string
    snapshot?: Record<string, unknown>
  }): Promise<string> {
    const status = opts.status ?? "delivered"
    const delivered =
      opts.deliveredAt !== undefined
        ? opts.deliveredAt
        : status === "delivered" || status === "completed"
          ? new Date()
          : null
    const sessionId = randomUUID()
    const orderId = randomUUID()
    const itemId = randomUUID()
    const orderStoreId = opts.inStoreId ?? storeId
    await adminTx("seed order", async (tx) => {
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: opts.buyerId,
        status: "paid",
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 5000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 5500n,
        expiresAt: new Date(Date.now() + 3600000),
      })
      await tx.insert(schema.orders).values({
        id: orderId,
        checkoutSessionId: sessionId,
        storeId: orderStoreId,
        buyerId: opts.buyerId,
        ...ORDER_SEED,
        fulfilmentStatus: status,
        shippedAt: status === "processing" ? null : new Date(),
        deliveredAt: delivered,
        completedAt: status === "completed" ? new Date() : null,
      })
      await tx.insert(schema.orderItems).values({
        id: itemId,
        orderId,
        storeId: orderStoreId,
        variantId: opts.variantId,
        productSnapshot: opts.snapshot ?? { id: opts.productId, name: "Rated Product" },
        variantSnapshot: { id: opts.variantId, name: "Single" },
        quantity: 1,
        unitPriceSen: 5000n,
        lineTotalSen: 5000n,
      })
    })
    trackedSessionIds.add(sessionId)
    trackedOrderIds.add(orderId)
    return itemId
  }

  async function readRatings(productId: string) {
    return adminTx("read ratings", async (tx) =>
      tx.select().from(schema.productRatings).where(eq(schema.productRatings.productId, productId)),
    )
  }

  async function readAggregate(productId: string) {
    return adminTx("read aggregate", async (tx) => {
      const [row] = await tx
        .select({ avg: schema.products.ratingAvg, count: schema.products.ratingCount })
        .from(schema.products)
        .where(eq(schema.products.id, productId))
      return row
    })
  }

  /** Moves a rating's created_at back by RATING_WINDOW_HOURS plus `offsetMinutes` (negative = inside). */
  async function ageRating(productId: string, userId: string, offsetMinutes: number) {
    await adminTx("age rating", async (tx) =>
      tx
        .update(schema.productRatings)
        .set({
          createdAt: sql`now() - make_interval(hours => ${RATING_WINDOW_HOURS}, mins => ${offsetMinutes})`,
        })
        .where(
          and(
            eq(schema.productRatings.productId, productId),
            eq(schema.productRatings.userId, userId),
          ),
        ),
    )
  }

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    process.env["DATABASE_URL"] = DATABASE_URL as string
    buyerAId = randomUUID()
    buyerBId = randomUUID()
    buyerCId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    storeCId = randomUUID()

    await adminTx("setup", async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerAId, email: `${buyerAId}@test.bomy`, role: "buyer" },
        { id: buyerBId, email: `${buyerBId}@test.bomy`, role: "buyer" },
        { id: buyerCId, email: `${buyerCId}@test.bomy`, role: "seller_owner" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values([
        {
          id: storeId,
          ownerId: sellerId,
          name: "Rating Test Store",
          slug: `rating-store-${storeId.slice(0, 8)}`,
          status: "active",
        },
        {
          id: storeCId,
          ownerId: buyerCId,
          name: "Buyer C Store",
          slug: `rating-store-c-${storeCId.slice(0, 8)}`,
          status: "active",
        },
      ])
    })
  })

  afterAll(async () => {
    await adminTx("cleanup", async (tx) => {
      if (trackedOrderIds.size > 0) {
        await tx.delete(schema.orders).where(inArray(schema.orders.id, [...trackedOrderIds]))
      }
      if (trackedSessionIds.size > 0) {
        await tx
          .delete(schema.checkoutSessions)
          .where(inArray(schema.checkoutSessions.id, [...trackedSessionIds]))
      }
      if (trackedProductIds.size > 0) {
        // Ratings and variants cascade with the product.
        await tx.delete(schema.products).where(inArray(schema.products.id, [...trackedProductIds]))
      }
      await tx.delete(schema.stores).where(inArray(schema.stores.id, [storeId, storeCId]))
    })
    await testDb.close()
  })

  // ── Happy path + eligibility ──────────────────────────────────────────────

  it("delivered order, first rating of 4 → ok, row exists, aggregate 4.00 / 1", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    signIn(buyerAId)

    const result = await rateProduct(itemId, 4)

    expect(result).toEqual({ ok: true, avg: "4.00", count: 1 })
    const rows = await readRatings(productId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(buyerAId)
    expect(rows[0]?.stars).toBe(4)
    expect(await readAggregate(productId)).toEqual({ avg: "4.00", count: 1 })
  })

  it.each(["shipped", "cancelled", "processing"] as const)(
    "order %s → NOT_ELIGIBLE, no row",
    async (status) => {
      const { productId, variantId } = await seedProduct()
      const itemId = await seedItem({ buyerId: buyerAId, productId, variantId, status })
      signIn(buyerAId)

      expect(await rateProduct(itemId, 5)).toEqual({ ok: false, error: "NOT_ELIGIBLE" })
      expect(await readRatings(productId)).toHaveLength(0)
      expect(await readAggregate(productId)).toEqual({ avg: "0.00", count: 0 })
    },
  )

  it("cancelled order that had delivered_at set → NOT_ELIGIBLE", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({
      buyerId: buyerAId,
      productId,
      variantId,
      status: "cancelled",
      deliveredAt: new Date(),
    })
    signIn(buyerAId)

    expect(await rateProduct(itemId, 5)).toEqual({ ok: false, error: "NOT_ELIGIBLE" })
    expect(await readRatings(productId)).toHaveLength(0)
  })

  it("completed order (delivered_at set) → rating ok, later change inside the window ok", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId, status: "completed" })
    signIn(buyerAId)

    expect(await rateProduct(itemId, 3)).toEqual({ ok: true, avg: "3.00", count: 1 })
    expect(await rateProduct(itemId, 5)).toEqual({ ok: true, avg: "5.00", count: 1 })
    const rows = await readRatings(productId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stars).toBe(5)
  })

  it("delivered status but delivered_at null → NOT_ELIGIBLE", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({
      buyerId: buyerAId,
      productId,
      variantId,
      status: "delivered",
      deliveredAt: null,
    })
    signIn(buyerAId)

    expect(await rateProduct(itemId, 5)).toEqual({ ok: false, error: "NOT_ELIGIBLE" })
    expect(await readRatings(productId)).toHaveLength(0)
  })

  it("order owned by another buyer → NOT_ELIGIBLE", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    signIn(buyerBId)

    expect(await rateProduct(itemId, 5)).toEqual({ ok: false, error: "NOT_ELIGIBLE" })
    expect(await readRatings(productId)).toHaveLength(0)
  })

  it("unknown or malformed order item id → NOT_ELIGIBLE", async () => {
    signIn(buyerAId)
    expect(await rateProduct(randomUUID(), 5)).toEqual({ ok: false, error: "NOT_ELIGIBLE" })
    expect(await rateProduct("not-a-uuid", 5)).toEqual({ ok: false, error: "NOT_ELIGIBLE" })
  })

  it("no session → UNAUTHENTICATED", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    signIn(null)

    expect(await rateProduct(itemId, 5)).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(await readRatings(productId)).toHaveLength(0)
  })

  // ── Invalid stars ─────────────────────────────────────────────────────────

  it.each([0, 6, 3.5, "5", null, Number.NaN, undefined])(
    "stars %s → INVALID_STARS, no row",
    async (stars) => {
      const { productId, variantId } = await seedProduct()
      const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
      signIn(buyerAId)

      expect(await rateProduct(itemId, stars)).toEqual({ ok: false, error: "INVALID_STARS" })
      expect(await readRatings(productId)).toHaveLength(0)
    },
  )

  // ── Own product ───────────────────────────────────────────────────────────

  it("buyer owns the product's store → OWN_PRODUCT, no row", async () => {
    const { productId, variantId } = await seedProduct(storeCId)
    const itemId = await seedItem({
      buyerId: buyerCId,
      productId,
      variantId,
      inStoreId: storeCId,
    })
    signIn(buyerCId)

    expect(await rateProduct(itemId, 5)).toEqual({ ok: false, error: "OWN_PRODUCT" })
    expect(await readRatings(productId)).toHaveLength(0)
    expect(await readAggregate(productId)).toEqual({ avg: "0.00", count: 0 })
  })

  it("a buyer who owns a different store and bought this product → ok", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerCId, productId, variantId })
    signIn(buyerCId)

    expect(await rateProduct(itemId, 2)).toEqual({ ok: true, avg: "2.00", count: 1 })
  })

  // ── 24-hour window ────────────────────────────────────────────────────────

  it("change inside the window (23h59m) → ok, aggregate updated, created_at unchanged", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    signIn(buyerAId)
    await rateProduct(itemId, 5)
    await ageRating(productId, buyerAId, -1)
    const [before] = await readRatings(productId)

    const result = await rateProduct(itemId, 1)

    expect(result).toEqual({ ok: true, avg: "1.00", count: 1 })
    const [after] = await readRatings(productId)
    expect(after?.stars).toBe(1)
    expect(after?.createdAt.getTime()).toBe(before?.createdAt.getTime())
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0)
    expect(await readAggregate(productId)).toEqual({ avg: "1.00", count: 1 })
  })

  it("a change does not extend the window: changed at 23h59m, rejected once aged past 24h", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    signIn(buyerAId)
    await rateProduct(itemId, 5)
    await ageRating(productId, buyerAId, -1)
    expect(await rateProduct(itemId, 4)).toMatchObject({ ok: true })
    // created_at was not touched by the change, so 2 more minutes would close it; simulate that.
    await ageRating(productId, buyerAId, 1)

    expect(await rateProduct(itemId, 1)).toEqual({ ok: false, error: "WINDOW_CLOSED" })
  })

  it("change after the window (24h01m) → WINDOW_CLOSED, row and aggregate unchanged", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    signIn(buyerAId)
    await rateProduct(itemId, 5)
    await ageRating(productId, buyerAId, 1)
    const [before] = await readRatings(productId)

    const result = await rateProduct(itemId, 1)

    expect(result).toEqual({ ok: false, error: "WINDOW_CLOSED" })
    const rows = await readRatings(productId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stars).toBe(5)
    expect(rows[0]?.updatedAt.getTime()).toBe(before?.updatedAt.getTime())
    // Locked rating still counts.
    expect(await readAggregate(productId)).toEqual({ avg: "5.00", count: 1 })
  })

  // ── Aggregate over several buyers ─────────────────────────────────────────

  it("two buyers rate 5 and 4 → 4.50 / 2; one changes to 2 → 3.50", async () => {
    const { productId, variantId } = await seedProduct()
    const itemA = await seedItem({ buyerId: buyerAId, productId, variantId })
    const itemB = await seedItem({ buyerId: buyerBId, productId, variantId })

    signIn(buyerAId)
    expect(await rateProduct(itemA, 5)).toEqual({ ok: true, avg: "5.00", count: 1 })
    signIn(buyerBId)
    expect(await rateProduct(itemB, 4)).toEqual({ ok: true, avg: "4.50", count: 2 })
    expect(await rateProduct(itemB, 2)).toEqual({ ok: true, avg: "3.50", count: 2 })
    expect(await readAggregate(productId)).toEqual({ avg: "3.50", count: 2 })
  })

  // ── Variant-less items (variant deleted) ──────────────────────────────────

  it("variant_id null, product_snapshot.id = the product → ok (rated via snapshot)", async () => {
    const { productId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId: null })
    signIn(buyerAId)

    expect(await rateProduct(itemId, 4)).toEqual({ ok: true, avg: "4.00", count: 1 })
    expect(await readRatings(productId)).toHaveLength(1)
  })

  it("rating survives the variant being deleted; the item still resolves via snapshot", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    signIn(buyerAId)
    await rateProduct(itemId, 5)
    await adminTx("delete variant", async (tx) =>
      tx.delete(schema.productVariants).where(eq(schema.productVariants.id, variantId)),
    )

    expect(await rateProduct(itemId, 3)).toEqual({ ok: true, avg: "3.00", count: 1 })
    expect(await readRatings(productId)).toHaveLength(1)
  })

  it.each([
    ["an unknown uuid", { id: "11111111-2222-4333-8444-555555555555", name: "Gone" }],
    ["a non-uuid id", { id: "not-a-uuid", name: "Gone" }],
    ["no id", { name: "Gone" }],
  ])("variant_id null, snapshot with %s → NOT_ELIGIBLE", async (_label, snapshot) => {
    const { productId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId: null, snapshot })
    signIn(buyerAId)

    expect(await rateProduct(itemId, 4)).toEqual({ ok: false, error: "NOT_ELIGIBLE" })
    expect(await readRatings(productId)).toHaveLength(0)
  })

  // ── Admin-removed rating ──────────────────────────────────────────────────

  it("admin-removed rating → RATING_REMOVED, row and aggregate unchanged, no new row", async () => {
    const { productId, variantId } = await seedProduct()
    const itemA = await seedItem({ buyerId: buyerAId, productId, variantId })
    const itemB = await seedItem({ buyerId: buyerBId, productId, variantId })
    signIn(buyerBId)
    await rateProduct(itemB, 4)
    signIn(buyerAId)
    await rateProduct(itemA, 1)
    await adminTx("remove rating", async (tx) => {
      await tx
        .update(schema.productRatings)
        .set({ removedAt: new Date(), removedBy: SYSTEM_ACTOR, removalReason: "test removal" })
        .where(
          and(
            eq(schema.productRatings.productId, productId),
            eq(schema.productRatings.userId, buyerAId),
          ),
        )
    })
    // Aggregate recomputed by hand the way the admin action will; excludes A's removed row.
    const { recomputeProductRating } = await import("@bomy/db")
    await adminTx("recompute", async (tx) => recomputeProductRating(tx, productId))
    const beforeRows = await readRatings(productId)

    const result = await rateProduct(itemA, 5)

    expect(result).toEqual({ ok: false, error: "RATING_REMOVED" })
    const afterRows = await readRatings(productId)
    expect(afterRows).toHaveLength(2)
    expect(afterRows.find((r) => r.userId === buyerAId)).toEqual(
      beforeRows.find((r) => r.userId === buyerAId),
    )
    expect(await readAggregate(productId)).toEqual({ avg: "4.00", count: 1 })
  })

  // ── Concurrency ───────────────────────────────────────────────────────────

  it("two simultaneous first ratings by the same buyer → exactly one row, count 1", async () => {
    for (let i = 0; i < 5; i++) {
      const { productId, variantId } = await seedProduct()
      const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
      signIn(buyerAId)

      const results = await Promise.all([rateProduct(itemId, 5), rateProduct(itemId, 3)])

      expect(results.every((r) => r.ok)).toBe(true)
      const rows = await readRatings(productId)
      expect(rows).toHaveLength(1)
      const agg = await readAggregate(productId)
      expect(agg?.count).toBe(1)
      expect(agg?.avg).toBe(`${rows[0]?.stars}.00`)
    }
  })

  it("two different buyers rating at once (5 and 4) → both counted, 4.50 / 2 (looped)", async () => {
    signIn(null)
    // Each call needs its own session; route by the call order of auth().
    for (let i = 0; i < 8; i++) {
      const { productId, variantId } = await seedProduct()
      const itemA = await seedItem({ buyerId: buyerAId, productId, variantId })
      const itemB = await seedItem({ buyerId: buyerBId, productId, variantId })
      mockAuth
        .mockResolvedValueOnce({ user: { id: buyerAId, role: "buyer" } })
        .mockResolvedValueOnce({ user: { id: buyerBId, role: "buyer" } })

      const [ra, rb] = await Promise.all([rateProduct(itemA, 5), rateProduct(itemB, 4)])

      expect(ra.ok).toBe(true)
      expect(rb.ok).toBe(true)
      // Whichever committed second saw both rows.
      const counts = [ra, rb].map((r) => (r.ok ? r.count : 0)).sort()
      expect(counts).toEqual([1, 2])
      expect(await readAggregate(productId)).toEqual({ avg: "4.50", count: 2 })
      expect(await readRatings(productId)).toHaveLength(2)
    }
  })

  // ── Shared eligibility helper under withTenant ────────────────────────────

  it("resolveRatableProduct works under the buyer's withTenant context too", async () => {
    const { productId, variantId } = await seedProduct()
    const itemId = await seedItem({ buyerId: buyerAId, productId, variantId })
    const snapItemId = await seedItem({ buyerId: buyerAId, productId, variantId: null })
    const shippedItemId = await seedItem({
      buyerId: buyerAId,
      productId,
      variantId,
      status: "shipped",
    })

    const resolved = await withTenant(
      testDb.db,
      { userId: buyerAId, userRole: "buyer" },
      async (tx) => ({
        item: await resolveRatableProduct(tx, itemId, buyerAId),
        snap: await resolveRatableProduct(tx, snapItemId, buyerAId),
        shipped: await resolveRatableProduct(tx, shippedItemId, buyerAId),
      }),
    )

    const expected = { productId, storeId, storeOwnerId: sellerId }
    expect(resolved.item).toEqual(expected)
    expect(resolved.snap).toEqual(expected)
    expect(resolved.shipped).toBeNull()
  })
})
