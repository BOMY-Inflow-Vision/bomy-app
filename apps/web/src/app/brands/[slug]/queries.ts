import { and, eq } from "drizzle-orm"

import { makeDb, schema } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function getStorePage(slug: string) {
  const db = getDb()

  const [store] = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      slug: schema.stores.slug,
      description: schema.stores.description,
    })
    .from(schema.stores)
    .where(and(eq(schema.stores.slug, slug), eq(schema.stores.status, "active")))
    .limit(1)

  if (!store) return null

  const products = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      slug: schema.products.slug,
      coverImageUrl: schema.products.coverImageUrl,
    })
    .from(schema.products)
    .where(and(eq(schema.products.storeId, store.id), eq(schema.products.status, "active")))
    .orderBy(schema.products.createdAt)
    .limit(24)

  return { store, products }
}
