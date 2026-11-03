/**
 * fetchBuyerOrderDetail rating fields: per item the buyer's own stars / created_at / removed_at
 * and `canRate` (the shared resolveRatableProduct rule, read under withTenant).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     node_modules/.bin/vitest --run tests/orders/order-queries
 */
import { randomUUID } from "node:crypto"

import { inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

import { fetchBuyerOrderDetail } from "../../src/app/account/orders/queries"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"

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

describe.skipIf(!shouldRun)("fetchBuyerOrderDetail rating fields", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerId: string
  let otherBuyerId: string
  let sellerId: string
  let storeId: string
  const orderIds: string[] = []
  const sessionIds: string[] = []
  const productIds: string[] = []

  const admin = <T>(fn: Parameters<typeof withAdmin<T>>[2]) =>
    withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "order-queries test" }, fn)

  async function seed(opts: {
    status: "shipped" | "delivered" | "completed"
    productStatus?: "active" | "archived"
  }) {
    const productId = randomUUID()
    const variantId = randomUUID()
    const sessionId = randomUUID()
    const orderId = randomUUID()
    const itemId = randomUUID()
    await admin(async (tx) => {
      await tx.insert(schema.products).values({
        id: productId,
        storeId,
        name: "Q Product",
        slug: `q-${productId.slice(0, 8)}`,
        status: opts.productStatus ?? "active",
      })
      await tx.insert(schema.productVariants).values({
        id: variantId,
        productId,
        name: "Single",
        priceMyrSen: 5000n,
        stockCount: 10,
      })
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
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
        storeId,
        buyerId,
        ...ORDER_SEED,
        fulfilmentStatus: opts.status,
        shippedAt: new Date(),
        deliveredAt: opts.status === "shipped" ? null : new Date(),
        completedAt: opts.status === "completed" ? new Date() : null,
      })
      await tx.insert(schema.orderItems).values({
        id: itemId,
        orderId,
        storeId,
        variantId,
        productSnapshot: { id: productId, name: "Q Product" },
        variantSnapshot: { id: variantId, name: "Single" },
        quantity: 1,
        unitPriceSen: 5000n,
        lineTotalSen: 5000n,
      })
    })
    productIds.push(productId)
    sessionIds.push(sessionId)
    orderIds.push(orderId)
    return { productId, orderId, itemId }
  }

  async function rate(productId: string, userId: string, stars: number, removed = false) {
    await admin(async (tx) => {
      await tx.insert(schema.productRatings).values({
        productId,
        userId,
        stars,
        ...(removed
          ? { removedAt: new Date(), removedBy: SYSTEM_ACTOR, removalReason: "test" }
          : {}),
      })
    })
  }

  beforeAll(async () => {
    testDb = makeDb()
    buyerId = randomUUID()
    otherBuyerId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    await admin(async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
        { id: otherBuyerId, email: `${otherBuyerId}@test.bomy`, role: "buyer" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Query Test Store",
        slug: `query-store-${storeId.slice(0, 8)}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    await admin(async (tx) => {
      if (orderIds.length) await tx.delete(schema.orders).where(inArray(schema.orders.id, orderIds))
      if (sessionIds.length) {
        await tx
          .delete(schema.checkoutSessions)
          .where(inArray(schema.checkoutSessions.id, sessionIds))
      }
      if (productIds.length) {
        await tx.delete(schema.products).where(inArray(schema.products.id, productIds))
      }
      await tx.delete(schema.stores).where(inArray(schema.stores.id, [storeId]))
    })
    await testDb.close()
  })

  it("delivered, unrated: canRate true, no rating", async () => {
    const { orderId, itemId } = await seed({ status: "delivered" })
    const order = await fetchBuyerOrderDetail(buyerId, orderId)
    const item = order!.items.find((i) => i.id === itemId)!
    expect(item.canRate).toBe(true)
    expect(item.stars).toBeNull()
    expect(item.ratingCreatedAt).toBeNull()
    expect(item.ratingRemovedAt).toBeNull()
  })

  it("delivered with a rating: own stars and created_at", async () => {
    const { orderId, productId } = await seed({ status: "delivered" })
    await rate(productId, buyerId, 4)
    const item = (await fetchBuyerOrderDetail(buyerId, orderId))!.items[0]!
    expect(item.canRate).toBe(true)
    expect(item.stars).toBe(4)
    expect(item.ratingCreatedAt).toBeInstanceOf(Date)
    expect(item.ratingRemovedAt).toBeNull()
  })

  it("completed order still shows the rating and canRate", async () => {
    const { orderId, productId } = await seed({ status: "completed" })
    await rate(productId, buyerId, 5)
    const item = (await fetchBuyerOrderDetail(buyerId, orderId))!.items[0]!
    expect(item.canRate).toBe(true)
    expect(item.stars).toBe(5)
  })

  it("removed rating is reported with removedAt", async () => {
    const { orderId, productId } = await seed({ status: "delivered" })
    await rate(productId, buyerId, 2, true)
    const item = (await fetchBuyerOrderDetail(buyerId, orderId))!.items[0]!
    expect(item.stars).toBe(2)
    expect(item.ratingRemovedAt).toBeInstanceOf(Date)
  })

  it("shipped order: canRate false", async () => {
    const { orderId } = await seed({ status: "shipped" })
    const item = (await fetchBuyerOrderDetail(buyerId, orderId))!.items[0]!
    expect(item.canRate).toBe(false)
    expect(item.stars).toBeNull()
  })

  it("another buyer's rating of the product is never shown", async () => {
    const { orderId, productId } = await seed({ status: "delivered" })
    await rate(productId, otherBuyerId, 1)
    const item = (await fetchBuyerOrderDetail(buyerId, orderId))!.items[0]!
    expect(item.stars).toBeNull()
  })

  it("archived product: control hidden (UI stricter than server)", async () => {
    const { orderId } = await seed({ status: "delivered", productStatus: "archived" })
    const item = (await fetchBuyerOrderDetail(buyerId, orderId))!.items[0]!
    expect(item.canRate).toBe(false)
  })
})
