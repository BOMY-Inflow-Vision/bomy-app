import { and, asc, eq, isNull } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

const LISTING_CAP = 60
const UNCATEGORIZED_SENTINEL = "__uncategorized"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function getStoreProducts(storeSlug: string, categorySlug: string | undefined) {
  return withPublicRead(getDb(), async (db) => {
    const [store] = await db
      .select({ id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug })
      .from(schema.stores)
      .where(and(eq(schema.stores.slug, storeSlug), eq(schema.stores.status, "active")))
      .limit(1)

    if (!store) return null

    const conditions = [eq(schema.products.storeId, store.id), eq(schema.products.status, "active")]

    if (categorySlug === UNCATEGORIZED_SENTINEL) {
      conditions.push(isNull(schema.products.categoryId))
    } else if (categorySlug) {
      const [category] = await db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.slug, categorySlug))
        .limit(1)
      // Unknown category slug: return the valid store with zero products, not a 404 —
      // the store itself is fine, only the filter didn't match anything (spec §6).
      if (!category) {
        return { store: { name: store.name, slug: store.slug }, products: [] }
      }
      conditions.push(eq(schema.products.categoryId, category.id))
    }

    const products = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        coverImageUrl: schema.products.coverImageUrl,
      })
      .from(schema.products)
      .where(and(...conditions))
      .orderBy(asc(schema.products.createdAt), asc(schema.products.id))
      .limit(LISTING_CAP)

    return { store: { name: store.name, slug: store.slug }, products }
  })
}
