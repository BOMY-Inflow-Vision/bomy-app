import { and, asc, eq } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

const CATEGORY_PREVIEW_CAP = 8
// Safety cap on the single store-scoped products query, not a per-category cap (that's
// CATEGORY_PREVIEW_CAP, applied in memory below). Bounds one pathological outlier store
// (thousands of active products) from blowing up the query; any normal store's full active
// catalog fits comfortably under this.
const STORE_PRODUCTS_SAFETY_CAP = 500

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

interface ProductCard {
  id: string
  name: string
  slug: string
  coverImageUrl: string | null
}

export async function getStorePage(slug: string) {
  return withPublicRead(getDb(), async (db) => {
    const [store] = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        slug: schema.stores.slug,
        description: schema.stores.description,
        bodyHtml: schema.stores.bodyHtml,
        videoId: schema.stores.videoId,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.slug, slug), eq(schema.stores.status, "active")))
      .limit(1)

    if (!store) return null

    const categories = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
      })
      .from(schema.categories)
      .where(eq(schema.categories.isActive, true))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))

    // One bounded, store-scoped query for every active product (instead of one query per
    // active platform category — that pattern doesn't scale with the platform's total
    // category count, only this store's actual products). Ordering matches the per-category
    // guarantee we need (created_at ASC, id ASC), and because we only ever push onto each
    // group's array in that same order, every group stays sorted without re-sorting.
    const allProducts = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        coverImageUrl: schema.products.coverImageUrl,
        categoryId: schema.products.categoryId,
      })
      .from(schema.products)
      .where(and(eq(schema.products.storeId, store.id), eq(schema.products.status, "active")))
      .orderBy(asc(schema.products.createdAt), asc(schema.products.id))
      .limit(STORE_PRODUCTS_SAFETY_CAP)

    const byCategoryId = new Map<string, ProductCard[]>()
    const uncategorizedProducts: ProductCard[] = []

    for (const p of allProducts) {
      const card: ProductCard = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        coverImageUrl: p.coverImageUrl,
      }
      if (p.categoryId === null) {
        uncategorizedProducts.push(card)
        continue
      }
      const existing = byCategoryId.get(p.categoryId)
      if (existing) {
        existing.push(card)
      } else {
        byCategoryId.set(p.categoryId, [card])
      }
    }

    const categorySections: Array<{
      category: { name: string; slug: string }
      products: ProductCard[]
      hasMore: boolean
    }> = []

    for (const category of categories) {
      const products = byCategoryId.get(category.id)
      if (!products || products.length === 0) continue

      categorySections.push({
        category: { name: category.name, slug: category.slug },
        products: products.slice(0, CATEGORY_PREVIEW_CAP),
        hasMore: products.length > CATEGORY_PREVIEW_CAP,
      })
    }

    return {
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description,
        bodyHtml: store.bodyHtml,
        videoId: store.videoId,
      },
      categorySections,
      uncategorized: {
        products: uncategorizedProducts.slice(0, CATEGORY_PREVIEW_CAP),
        hasMore: uncategorizedProducts.length > CATEGORY_PREVIEW_CAP,
      },
    }
  })
}
