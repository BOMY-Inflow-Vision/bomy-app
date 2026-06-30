import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin, withPublicRead } from "@bomy/db"

import { getCategories, getProductBySlug, getProducts } from "@/app/products/queries"
import { getStorePage } from "@/app/brands/[slug]/queries"
import { getBrands } from "@/app/brands/queries"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

describe.skipIf(!shouldRun)("storefront queries", () => {
  let testDb: ReturnType<typeof makeDb>
  let storeId: string
  let storeSlug: string
  let categoryId: string
  let productId: string
  let productSlug: string
  let userId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })

    userId = randomUUID()
    storeSlug = `test-store-${randomUUID().slice(0, 8)}`
    productSlug = `test-product-${randomUUID().slice(0, 8)}`

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "storefront test setup" },
      async (tx) => {
        const [user] = await tx
          .insert(schema.users)
          .values({
            id: userId,
            email: `${userId}@test.com`,
            role: "seller_owner",
            name: "Test Seller",
          })
          .returning({ id: schema.users.id })
        const [store] = await tx
          .insert(schema.stores)
          .values({ ownerId: user!.id, name: "Test Store", slug: storeSlug, status: "active" })
          .returning({ id: schema.stores.id })
        storeId = store!.id

        const [cat] = await tx
          .insert(schema.categories)
          .values({
            name: "Test Category",
            slug: `cat-${randomUUID().slice(0, 8)}`,
            isActive: true,
          })
          .returning({ id: schema.categories.id })
        categoryId = cat!.id

        const [product] = await tx
          .insert(schema.products)
          .values({
            storeId,
            name: "Test Product",
            slug: productSlug,
            status: "active",
            categoryId,
          })
          .returning({ id: schema.products.id })
        productId = product!.id

        await tx
          .insert(schema.productVariants)
          .values({ productId, name: "Default", priceMyrSen: 2999n, stockCount: 10 })
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "storefront test cleanup" },
      async (tx) => {
        await tx
          .delete(schema.productVariants)
          .where(eq(schema.productVariants.productId, productId))
        await tx.delete(schema.products).where(eq(schema.products.id, productId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, categoryId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, userId))
      },
    )
    await testDb.close()
  })

  it("getCategories returns active categories", async () => {
    const cats = await getCategories()
    const found = cats.find((c) => c.id === categoryId)
    expect(found).toBeDefined()
    expect(found?.name).toBe("Test Category")
  })

  it("getProducts returns active products with store and min price", async () => {
    const result = await getProducts({})
    const found = result.products.find((p) => p.id === productId)
    expect(found).toBeDefined()
    expect(found?.storeName).toBe("Test Store")
    expect(found?.minPriceSen).toBe(2999)
  })

  it("getProducts filters by category", async () => {
    const result = await getProducts({ categoryId })
    const found = result.products.find((p) => p.id === productId)
    expect(found).toBeDefined()
  })

  it("getProducts returns empty for unknown category", async () => {
    const result = await getProducts({ categoryId: randomUUID() })
    const found = result.products.find((p) => p.id === productId)
    expect(found).toBeUndefined()
  })

  it("getProducts FTS finds product by name keyword", async () => {
    const result = await getProducts({ query: "Test Product" })
    const found = result.products.find((p) => p.id === productId)
    expect(found).toBeDefined()
  })

  it("getProductBySlug returns product with variants and images", async () => {
    const product = await getProductBySlug(storeSlug, productSlug)
    expect(product).not.toBeNull()
    expect(product?.id).toBe(productId)
    expect(product?.variants).toHaveLength(1)
    expect(product?.variants[0]?.priceSen).toBe(2999)
    expect(product?.variants[0]?.stockCount).toBe(10)
  })

  it("getProductBySlug returns null for unknown slug", async () => {
    const product = await getProductBySlug(storeSlug, "no-such-slug")
    expect(product).toBeNull()
  })

  it("getProductBySlug returns null for inactive product", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.products).set({ status: "draft" }).where(eq(schema.products.id, productId)),
    )
    const product = await getProductBySlug(storeSlug, productSlug)
    expect(product).toBeNull()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.products).set({ status: "active" }).where(eq(schema.products.id, productId)),
    )
  })

  it("getStorePage returns store with active products", async () => {
    const data = await getStorePage(storeSlug)
    expect(data).not.toBeNull()
    expect(data?.store.name).toBe("Test Store")
    expect(data?.products.some((p) => p.id === productId)).toBe(true)
  })

  it("getStorePage returns null for unknown slug", async () => {
    const data = await getStorePage("no-such-store")
    expect(data).toBeNull()
  })

  it("getStorePage returns null for suspended store", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.stores).set({ status: "suspended" }).where(eq(schema.stores.id, storeId)),
    )
    const data = await getStorePage(storeSlug)
    expect(data).toBeNull()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.stores).set({ status: "active" }).where(eq(schema.stores.id, storeId)),
    )
  })

  it("getProducts returns empty for suspended store's active product (RLS gap closed)", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.stores).set({ status: "suspended" }).where(eq(schema.stores.id, storeId)),
    )
    const result = await getProducts({})
    const found = result.products.find((p) => p.id === productId)
    expect(found).toBeUndefined()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.stores).set({ status: "active" }).where(eq(schema.stores.id, storeId)),
    )
  })

  it("getProducts ignores malformed categoryId without throwing", async () => {
    const result = await getProducts({ categoryId: "not-a-uuid" })
    expect(result.products).toBeDefined()
    expect(Array.isArray(result.products)).toBe(true)
  })

  it("withPublicRead rejects writes (read-only transaction)", async () => {
    await expect(
      withPublicRead(testDb.db, async (db) => {
        await db.insert(schema.categories).values({
          name: "Should Fail",
          slug: "should-fail",
          isActive: true,
        })
      }),
    ).rejects.toThrow()
  })
})

describe.skipIf(!shouldRun)("getBrands queries", () => {
  let testDb: ReturnType<typeof makeDb>
  let userId: string
  let activeStoreId: string
  let activeStoreSlug: string
  let suspendedStoreId: string
  let productId: string
  let categoryId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })

    userId = randomUUID()
    activeStoreSlug = `brands-test-${randomUUID().slice(0, 8)}`

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "getBrands test setup" },
      async (tx) => {
        const [user] = await tx
          .insert(schema.users)
          .values({
            id: userId,
            email: `${userId}@test.com`,
            role: "seller_owner",
            name: "Brands Test Seller",
          })
          .returning({ id: schema.users.id })

        const [active] = await tx
          .insert(schema.stores)
          .values({
            ownerId: user!.id,
            name: "Brands Active Store",
            slug: activeStoreSlug,
            description: "findme-by-desc",
            status: "active",
          })
          .returning({ id: schema.stores.id })
        activeStoreId = active!.id

        const [suspended] = await tx
          .insert(schema.stores)
          .values({
            ownerId: user!.id,
            name: "Brands Suspended Store",
            slug: `brands-suspended-${randomUUID().slice(0, 8)}`,
            status: "suspended",
          })
          .returning({ id: schema.stores.id })
        suspendedStoreId = suspended!.id

        const [cat] = await tx
          .insert(schema.categories)
          .values({ name: "Brands Cat", slug: `bcat-${randomUUID().slice(0, 8)}`, isActive: true })
          .returning({ id: schema.categories.id })
        categoryId = cat!.id

        const [product] = await tx
          .insert(schema.products)
          .values({
            storeId: activeStoreId,
            name: "Brands Product",
            slug: `brands-prod-${randomUUID().slice(0, 8)}`,
            status: "active",
            categoryId,
          })
          .returning({ id: schema.products.id })
        productId = product!.id

        await tx
          .insert(schema.productVariants)
          .values({ productId, name: "Default", priceMyrSen: 1999n, stockCount: 5 })
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "getBrands test cleanup" },
      async (tx) => {
        await tx
          .delete(schema.productVariants)
          .where(eq(schema.productVariants.productId, productId))
        await tx.delete(schema.products).where(eq(schema.products.id, productId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, categoryId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, activeStoreId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, suspendedStoreId))
        await tx.delete(schema.users).where(eq(schema.users.id, userId))
      },
    )
    await testDb.close()
  })

  it("returns active stores and excludes suspended stores", async () => {
    const { brands } = await getBrands({})
    const active = brands.find((b) => b.id === activeStoreId)
    const suspended = brands.find((b) => b.id === suspendedStoreId)
    expect(active).toBeDefined()
    expect(suspended).toBeUndefined()
  })

  it("counts only active products for a store", async () => {
    const { brands } = await getBrands({})
    const store = brands.find((b) => b.id === activeStoreId)
    expect(store?.productCount).toBe(1)
  })

  it("excludes draft products from the active-product count", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.products).set({ status: "draft" }).where(eq(schema.products.id, productId)),
    )
    const { brands } = await getBrands({})
    const store = brands.find((b) => b.id === activeStoreId)
    expect(store?.productCount).toBe(0)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.products).set({ status: "active" }).where(eq(schema.products.id, productId)),
    )
  })

  it("filters by name (case-insensitive)", async () => {
    const { brands } = await getBrands({ query: "brands active" })
    const found = brands.find((b) => b.id === activeStoreId)
    expect(found).toBeDefined()
  })

  it("does not match on description alone (search is name + excerpt only)", async () => {
    const { brands } = await getBrands({ query: "findme-by-desc" })
    const found = brands.find((b) => b.id === activeStoreId)
    expect(found).toBeUndefined()
  })

  it("filters by excerpt keyword", async () => {
    const testExcerpt = `excerpt-search-${randomUUID().slice(0, 8)}`
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx
        .update(schema.stores)
        .set({ excerpt: testExcerpt })
        .where(eq(schema.stores.id, activeStoreId)),
    )
    const { brands } = await getBrands({ query: testExcerpt })
    const found = brands.find((b) => b.id === activeStoreId)
    expect(found).toBeDefined()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "restore" }, (tx) =>
      tx.update(schema.stores).set({ excerpt: null }).where(eq(schema.stores.id, activeStoreId)),
    )
  })

  it("returns excerpt for store in listing", async () => {
    const testExcerpt = "storefront-excerpt-value"
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx
        .update(schema.stores)
        .set({ excerpt: testExcerpt })
        .where(eq(schema.stores.id, activeStoreId)),
    )
    const { brands } = await getBrands({})
    const store = brands.find((b) => b.id === activeStoreId)
    expect(store?.excerpt).toBe(testExcerpt)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "restore" }, (tx) =>
      tx.update(schema.stores).set({ excerpt: null }).where(eq(schema.stores.id, activeStoreId)),
    )
  })

  it("returns no results for a non-matching query", async () => {
    const { brands } = await getBrands({ query: randomUUID() })
    expect(brands).toHaveLength(0)
  })

  it("reports totalPages >= 1 even when results are empty", async () => {
    const { totalPages } = await getBrands({ query: randomUUID() })
    expect(totalPages).toBe(1)
  })
})
