import { and, asc, count, eq, exists, ilike, inArray, or } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

const PAGE_SIZE = 24
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getStoreCategories() {
  return withPublicRead(getDb(), (db) =>
    db
      .select({ id: schema.storeCategories.id, name: schema.storeCategories.name })
      .from(schema.storeCategories)
      .where(eq(schema.storeCategories.isActive, true))
      .orderBy(asc(schema.storeCategories.sortOrder), asc(schema.storeCategories.name)),
  )
}

export async function getBrands({
  query,
  page = 1,
  storeCategoryId,
}: {
  query?: string
  page?: number
  storeCategoryId?: string
}) {
  const offset = (page - 1) * PAGE_SIZE
  const safeCat = storeCategoryId && UUID_RE.test(storeCategoryId) ? storeCategoryId : undefined

  return withPublicRead(getDb(), async (db) => {
    const where = and(
      eq(schema.stores.status, "active"),
      query?.trim()
        ? or(
            ilike(schema.stores.name, `%${query.trim()}%`),
            ilike(schema.stores.excerpt, `%${query.trim()}%`),
          )
        : undefined,
      safeCat
        ? exists(
            db
              .select({ x: schema.storeCategoryAssignments.storeId })
              .from(schema.storeCategoryAssignments)
              .where(
                and(
                  eq(schema.storeCategoryAssignments.storeId, schema.stores.id),
                  eq(schema.storeCategoryAssignments.storeCategoryId, safeCat),
                ),
              ),
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
          excerpt: schema.stores.excerpt,
          productCount: count(schema.products.id),
        })
        .from(schema.stores)
        .leftJoin(
          schema.products,
          and(eq(schema.products.storeId, schema.stores.id), eq(schema.products.status, "active")),
        )
        .where(where)
        .groupBy(schema.stores.id)
        .orderBy(schema.stores.name, schema.stores.id)
        .limit(PAGE_SIZE)
        .offset(offset),
    ])

    const storeIds = rows.map((r) => r.id)
    const categoryMap = new Map<string, string[]>()

    if (storeIds.length > 0) {
      const assignments = await db
        .select({
          storeId: schema.storeCategoryAssignments.storeId,
          categoryName: schema.storeCategories.name,
        })
        .from(schema.storeCategoryAssignments)
        .innerJoin(
          schema.storeCategories,
          and(
            eq(schema.storeCategories.id, schema.storeCategoryAssignments.storeCategoryId),
            eq(schema.storeCategories.isActive, true),
          ),
        )
        .where(inArray(schema.storeCategoryAssignments.storeId, storeIds))
        .orderBy(schema.storeCategories.sortOrder, schema.storeCategories.name)

      for (const row of assignments) {
        const list = categoryMap.get(row.storeId) ?? []
        list.push(row.categoryName)
        categoryMap.set(row.storeId, list)
      }
    }

    const total = countRow[0]?.total ?? 0
    return {
      brands: rows.map((r) => ({
        ...r,
        categories: categoryMap.get(r.id) ?? [],
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    }
  })
}
