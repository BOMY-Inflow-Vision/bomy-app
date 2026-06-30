import { and, count, eq, ilike, or } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

const PAGE_SIZE = 24

export async function getBrands({ query, page = 1 }: { query?: string; page?: number }) {
  const offset = (page - 1) * PAGE_SIZE

  return withPublicRead(getDb(), async (db) => {
    const where = and(
      eq(schema.stores.status, "active"),
      query?.trim()
        ? or(
            ilike(schema.stores.name, `%${query.trim()}%`),
            ilike(schema.stores.description, `%${query.trim()}%`),
          )
        : undefined,
    )

    const [countRow, rows] = await Promise.all([
      db.select({ total: count() }).from(schema.stores).where(where),
      db
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          slug: schema.stores.slug,
          description: schema.stores.description,
          productCount: count(schema.products.id),
        })
        .from(schema.stores)
        .leftJoin(
          schema.products,
          and(eq(schema.products.storeId, schema.stores.id), eq(schema.products.status, "active")),
        )
        .where(where)
        .groupBy(schema.stores.id)
        .orderBy(schema.stores.name)
        .limit(PAGE_SIZE)
        .offset(offset),
    ])

    const total = countRow[0]?.total ?? 0
    return {
      brands: rows,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    }
  })
}
