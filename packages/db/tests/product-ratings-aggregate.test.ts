/**
 * recomputeProductRating integration tests (migration 0035).
 *
 * Gated like rls.test.ts. All writes run under withAdmin, the only path that
 * may touch products.rating_avg / rating_count.
 */
import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { recomputeProductRating } from "../src/ratings.js"
import { productRatings, products, stores, users } from "../src/schema/index.js"
import { withAdmin } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

describe.skipIf(!shouldRun)("recomputeProductRating", () => {
  let handle: Db
  const createdProducts: Array<{ productId: string; storeId: string }> = []

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      for (const p of createdProducts) {
        await tx.delete(products).where(eq(products.id, p.productId))
        await tx.delete(stores).where(eq(stores.id, p.storeId))
      }
    })
    await handle.close()
  })

  /** Seeds a product plus one buyer per entry in `stars`, each rating it. */
  async function seed(stars: number[]): Promise<{ productId: string; buyers: string[] }> {
    const sellerId = randomUUID()
    const storeId = randomUUID()
    const productId = randomUUID()
    const buyers = stars.map(() => randomUUID())
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(users)
        .values([
          { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
          ...buyers.map((id) => ({ id, email: `${id}@test.bomy`, role: "buyer" as const })),
        ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Aggregate Test Store",
        slug: `agg-${storeId}`,
        status: "active",
      })
      await tx.insert(products).values({
        id: productId,
        storeId,
        name: "Aggregate Test Tee",
        slug: `agg-tee-${productId}`,
        status: "active",
      })
      if (buyers.length > 0) {
        await tx
          .insert(productRatings)
          .values(buyers.map((userId, i) => ({ productId, userId, stars: stars[i] as number })))
      }
    })
    createdProducts.push({ productId, storeId })
    return { productId, buyers }
  }

  function recompute(productId: string) {
    return withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test recompute" }, (tx) =>
      recomputeProductRating(tx, productId),
    )
  }

  async function storedColumns(productId: string) {
    const [row] = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test read" }, (tx) =>
      tx
        .select({ avg: products.ratingAvg, count: products.ratingCount })
        .from(products)
        .where(eq(products.id, productId)),
    )
    return row
  }

  async function remove(productId: string, userId: string) {
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test remove rating" }, (tx) =>
      tx
        .update(productRatings)
        .set({ removedAt: new Date(), removedBy: SYSTEM_ACTOR, removalReason: "test" })
        .where(and(eq(productRatings.productId, productId), eq(productRatings.userId, userId))),
    )
  }

  it("no rows → 0.00 / 0", async () => {
    const { productId } = await seed([])
    expect(await recompute(productId)).toEqual({ avg: "0.00", count: 0 })
    expect(await storedColumns(productId)).toEqual({ avg: "0.00", count: 0 })
  })

  it("ratings 5 and 4 → 4.50 / 2, written to the product row", async () => {
    const { productId } = await seed([5, 4])
    expect(await recompute(productId)).toEqual({ avg: "4.50", count: 2 })
    expect(await storedColumns(productId)).toEqual({ avg: "4.50", count: 2 })
  })

  it("a removed rating is excluded; all removed → back to 0 / 0", async () => {
    const { productId, buyers } = await seed([5, 4])
    await recompute(productId)

    await remove(productId, buyers[1] as string) // the 4-star
    expect(await recompute(productId)).toEqual({ avg: "5.00", count: 1 })

    await remove(productId, buyers[0] as string)
    expect(await recompute(productId)).toEqual({ avg: "0.00", count: 0 })
    expect(await storedColumns(productId)).toEqual({ avg: "0.00", count: 0 })
  })

  it("rounds once to 1 decimal: 5,5,4,4,4,4,4,4,4,4 → 4.20", async () => {
    const { productId } = await seed([5, 5, 4, 4, 4, 4, 4, 4, 4, 4])
    expect(await recompute(productId)).toEqual({ avg: "4.20", count: 10 })
  })

  it("rounds half-up: 5,4,4,4 (4.25) → 4.30", async () => {
    const { productId } = await seed([5, 4, 4, 4])
    expect(await recompute(productId)).toEqual({ avg: "4.30", count: 4 })
  })
})
