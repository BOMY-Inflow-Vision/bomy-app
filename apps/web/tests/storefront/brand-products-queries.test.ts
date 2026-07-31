import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getStoreProducts } from "@/app/brands/[slug]/products/queries"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("getStoreProducts", () => {
  let testDb: ReturnType<typeof makeDb>
  let ownerId: string
  let storeSlug: string
  let storeId: string
  let categoryId: string
  let categorySlug: string
  let deactivatedCategoryId: string
  let deactivatedCategorySlug: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    storeSlug = `products-route-test-${randomUUID().slice(0, 8)}`
    categorySlug = `route-cat-${randomUUID().slice(0, 8)}`
    deactivatedCategorySlug = `route-cat-deactivated-${randomUUID().slice(0, 8)}`

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "products route test seed" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: ownerId,
          email: `${ownerId}@test.bomy`,
          role: "seller_owner",
          name: "Products Route Test Seller",
        })
        const [store] = await tx
          .insert(schema.stores)
          .values({
            ownerId,
            name: "Products Route Test Store",
            slug: storeSlug,
            status: "active",
          })
          .returning({ id: schema.stores.id })
        storeId = store!.id

        const [category] = await tx
          .insert(schema.categories)
          .values({ name: "Route Cat", slug: categorySlug })
          .returning({ id: schema.categories.id })
        categoryId = category!.id

        // Deactivated by an admin after being assigned (toggleCategory has no cascade to
        // products.category_id) — a public read must still be able to resolve this slug so the
        // filtered listing keeps working (RLS: categories_public_active_product_ref, migration
        // 0029).
        const [deactivatedCategory] = await tx
          .insert(schema.categories)
          .values({ name: "Route Cat Deactivated", slug: deactivatedCategorySlug, isActive: false })
          .returning({ id: schema.categories.id })
        deactivatedCategoryId = deactivatedCategory!.id

        await tx.insert(schema.products).values([
          {
            storeId,
            categoryId,
            name: "Categorized Item",
            slug: `categorized-item-${randomUUID().slice(0, 6)}`,
            status: "active",
          },
          {
            storeId,
            categoryId: null,
            name: "No Category Item",
            slug: `no-category-item-${randomUUID().slice(0, 6)}`,
            status: "active",
          },
          {
            storeId,
            categoryId: deactivatedCategoryId,
            name: "Deactivated Category Item",
            slug: `deactivated-category-item-${randomUUID().slice(0, 6)}`,
            status: "active",
          },
        ])
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "products route test cleanup" },
      async (tx) => {
        await tx.delete(schema.products).where(eq(schema.products.storeId, storeId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, categoryId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, deactivatedCategoryId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      },
    )
    await testDb.close()
  })

  it("returns null for an unknown store", async () => {
    expect(await getStoreProducts("no-such-store-slug", undefined)).toBeNull()
  })

  it("returns all active products when no category filter is given", async () => {
    const result = await getStoreProducts(storeSlug, undefined)
    expect(result?.products.map((p) => p.name).sort()).toEqual([
      "Categorized Item",
      "Deactivated Category Item",
      "No Category Item",
    ])
  })

  it("filters to a real category slug", async () => {
    const result = await getStoreProducts(storeSlug, categorySlug)
    expect(result?.products.map((p) => p.name)).toEqual(["Categorized Item"])
  })

  it("filters to a category slug whose category was later deactivated", async () => {
    const result = await getStoreProducts(storeSlug, deactivatedCategorySlug)
    expect(result?.products.map((p) => p.name)).toEqual(["Deactivated Category Item"])
  })

  it("filters to uncategorized via the __uncategorized sentinel", async () => {
    const result = await getStoreProducts(storeSlug, "__uncategorized")
    expect(result?.products.map((p) => p.name)).toEqual(["No Category Item"])
  })

  it("returns an empty product list (not null) for an unknown category slug", async () => {
    const result = await getStoreProducts(storeSlug, "does-not-exist")
    expect(result).not.toBeNull()
    expect(result?.products).toEqual([])
  })
})
