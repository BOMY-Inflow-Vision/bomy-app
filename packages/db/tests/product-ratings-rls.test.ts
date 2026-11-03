/**
 * product_ratings RLS + constraint integration tests (migration 0035).
 *
 * Gated like rls.test.ts: needs DATABASE_APP_URL (the limited bomy_app role, so
 * RLS actually fires) and BOMY_RLS_READY=1. Each case seeds two buyers, one
 * seller, one store and one product via withAdmin.
 *
 * Writes to product_ratings are admin-bypass only (the single writer is the
 * withAdmin rating action), so seeding ratings goes through withAdmin too.
 */
import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { productRatings, products, stores, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

// Reads the Postgres SQLSTATE off a caught error (42501 = RLS / privilege,
// 23514 = CHECK, 23505 = UNIQUE), so each test asserts WHICH mechanism fired.
function pgErrorCode(err: unknown): string | undefined {
  if (err === null || typeof err !== "object") return undefined
  const e = err as { code?: string; cause?: { code?: string } }
  return e.code ?? e.cause?.code
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (err) {
    return err
  }
  return undefined
}

interface Fixture {
  buyerA: string
  buyerB: string
  sellerId: string
  storeId: string
  productId: string
}

describe.skipIf(!shouldRun)("product_ratings RLS (migration 0035)", () => {
  let handle: Db
  const created: Fixture[] = []

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      for (const f of created) {
        // product_ratings rows go with the product (ON DELETE CASCADE).
        await tx.delete(products).where(eq(products.id, f.productId))
        await tx.delete(stores).where(eq(stores.id, f.storeId))
      }
    })
    await handle.close()
  })

  async function seed(): Promise<Fixture> {
    const f: Fixture = {
      buyerA: randomUUID(),
      buyerB: randomUUID(),
      sellerId: randomUUID(),
      storeId: randomUUID(),
      productId: randomUUID(),
    }
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: f.buyerA, email: `${f.buyerA}@test.bomy`, role: "buyer" },
        { id: f.buyerB, email: `${f.buyerB}@test.bomy`, role: "buyer" },
        { id: f.sellerId, email: `${f.sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(stores).values({
        id: f.storeId,
        ownerId: f.sellerId,
        name: "Ratings Test Store",
        slug: `ratings-${f.storeId}`,
        status: "active",
      })
      await tx.insert(products).values({
        id: f.productId,
        storeId: f.storeId,
        name: "Ratings Test Tee",
        slug: `ratings-tee-${f.productId}`,
        status: "active",
      })
    })
    created.push(f)
    return f
  }

  async function adminInsertRating(productId: string, userId: string, stars: number) {
    return withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed rating" }, (tx) =>
      tx.insert(productRatings).values({ productId, userId, stars }),
    )
  }

  it("(a) a buyer under withTenant selects only their own rating row", async () => {
    const f = await seed()
    await adminInsertRating(f.productId, f.buyerA, 5)
    await adminInsertRating(f.productId, f.buyerB, 3)

    const rows = await withTenant(handle.db, { userId: f.buyerA, userRole: "buyer" }, (tx) =>
      tx
        .select({ userId: productRatings.userId, stars: productRatings.stars })
        .from(productRatings)
        .where(eq(productRatings.productId, f.productId)),
    )
    expect(rows).toEqual([{ userId: f.buyerA, stars: 5 }])
  })

  it("(b) a buyer under withTenant cannot INSERT a rating, not even their own row", async () => {
    const f = await seed()
    const err = await caught(
      withTenant(handle.db, { userId: f.buyerA, userRole: "buyer" }, (tx) =>
        tx.insert(productRatings).values({ productId: f.productId, userId: f.buyerA, stars: 4 }),
      ),
    )
    expect(pgErrorCode(err)).toBe("42501")
  })

  it("(b) a buyer under withTenant cannot UPDATE their own rating (no row matches)", async () => {
    const f = await seed()
    await adminInsertRating(f.productId, f.buyerA, 2)

    const updated = await withTenant(handle.db, { userId: f.buyerA, userRole: "buyer" }, (tx) =>
      tx
        .update(productRatings)
        .set({ stars: 5 })
        .where(eq(productRatings.productId, f.productId))
        .returning({ id: productRatings.id }),
    )
    expect(updated).toHaveLength(0)

    const [row] = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test read" }, (tx) =>
      tx
        .select({ stars: productRatings.stars })
        .from(productRatings)
        .where(eq(productRatings.productId, f.productId)),
    )
    expect(row?.stars).toBe(2)
  })

  it("(c) stars = 6 and stars = 0 fail the CHECK", async () => {
    const f = await seed()
    expect(pgErrorCode(await caught(adminInsertRating(f.productId, f.buyerA, 6)))).toBe("23514")
    expect(pgErrorCode(await caught(adminInsertRating(f.productId, f.buyerA, 0)))).toBe("23514")
  })

  it("(d) a second row for the same (product_id, user_id) fails the UNIQUE", async () => {
    const f = await seed()
    await adminInsertRating(f.productId, f.buyerA, 4)
    expect(pgErrorCode(await caught(adminInsertRating(f.productId, f.buyerA, 5)))).toBe("23505")
  })

  it("(e) a fresh product has rating_avg = 0 and rating_count = 0", async () => {
    const f = await seed()
    const [row] = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test read" }, (tx) =>
      tx
        .select({ avg: products.ratingAvg, count: products.ratingCount })
        .from(products)
        .where(eq(products.id, f.productId)),
    )
    expect(row).toEqual({ avg: "0.00", count: 0 })
  })

  it("(f) a seller cannot write the cached rating columns on their own product (trigger)", async () => {
    const f = await seed()
    const sellerCtx = { userId: f.sellerId, userRole: "seller_owner" as const, sellerId: f.storeId }

    const avgErr = await caught(
      withTenant(handle.db, sellerCtx, (tx) =>
        tx.update(products).set({ ratingAvg: "5" }).where(eq(products.id, f.productId)),
      ),
    )
    expect(pgErrorCode(avgErr)).toBe("42501")
    expect(String((avgErr as Error).message)).toMatch(/rating_avg|rating_count/)

    const countErr = await caught(
      withTenant(handle.db, sellerCtx, (tx) =>
        tx.update(products).set({ ratingCount: 99 }).where(eq(products.id, f.productId)),
      ),
    )
    expect(pgErrorCode(countErr)).toBe("42501")

    // The same seller can still change other columns.
    const renamed = await withTenant(handle.db, sellerCtx, (tx) =>
      tx
        .update(products)
        .set({ name: "Renamed Tee" })
        .where(eq(products.id, f.productId))
        .returning({ name: products.name }),
    )
    expect(renamed).toEqual([{ name: "Renamed Tee" }])

    // The admin-bypass path may set the columns.
    const [adminSet] = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "test set cached rating" },
      (tx) =>
        tx
          .update(products)
          .set({ ratingAvg: "4.5", ratingCount: 2 })
          .where(eq(products.id, f.productId))
          .returning({ avg: products.ratingAvg, count: products.ratingCount }),
    )
    expect(adminSet).toEqual({ avg: "4.50", count: 2 })
  })

  it("bomy_app has no DELETE on product_ratings", async () => {
    const result = await handle.db.execute(
      sql`select has_table_privilege('bomy_app', 'product_ratings', 'DELETE') as ok`,
    )
    expect((result as unknown as Array<{ ok: boolean }>)[0]?.ok).toBe(false)
  })
})
