import { and, asc, count, desc, eq, sql } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export { formatMyrSen } from "@/lib/format"

const PAGE_SIZE = 20

export async function getCategories() {
  return withPublicRead(getDb(), (db) =>
    db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
      })
      .from(schema.categories)
      .where(eq(schema.categories.isActive, true))
      .orderBy(schema.categories.name),
  )
}

export async function getProducts({
  query,
  categoryId,
  page = 1,
}: {
  query?: string
  categoryId?: string
  page?: number
}) {
  const safeCategory = categoryId && UUID_RE.test(categoryId) ? categoryId : undefined
  const conditions = [eq(schema.products.status, "active"), eq(schema.stores.status, "active")]
  if (safeCategory) conditions.push(eq(schema.products.categoryId, safeCategory))
  if (query?.trim()) {
    conditions.push(
      sql`${schema.products.searchVector} @@ plainto_tsquery('english', ${query.trim()})`,
    )
  }

  const where = and(...conditions)

  const orderBy = query?.trim()
    ? sql`ts_rank(${schema.products.searchVector}, plainto_tsquery('english', ${query.trim()})) DESC`
    : desc(schema.products.createdAt)

  return withPublicRead(getDb(), async (db) => {
    const [countRow] = await db
      .select({ total: count() })
      .from(schema.products)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
      .where(where)

    const rows = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        storeName: schema.stores.name,
        storeSlug: schema.stores.slug,
        storeId: schema.products.storeId,
        coverImageUrl: schema.products.coverImageUrl,
        categoryName: schema.categories.name,
        minPriceSen: sql<string>`min(${schema.productVariants.priceMyrSen})`,
      })
      .from(schema.products)
      .innerJoin(
        schema.stores,
        and(eq(schema.stores.id, schema.products.storeId), eq(schema.stores.status, "active")),
      )
      .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
      .leftJoin(
        schema.productVariants,
        and(
          eq(schema.productVariants.productId, schema.products.id),
          eq(schema.productVariants.isActive, true),
        ),
      )
      .where(where)
      .groupBy(
        schema.products.id,
        schema.products.name,
        schema.products.slug,
        schema.products.storeId,
        schema.stores.id,
        schema.stores.name,
        schema.stores.slug,
        schema.products.coverImageUrl,
        schema.categories.name,
      )
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)

    const total = Number(countRow?.total ?? 0)

    return {
      products: rows.map((r) => ({
        ...r,
        minPriceSen: r.minPriceSen != null ? Number(r.minPriceSen) : null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
    }
  })
}

export async function getProductBySlug(storeSlug: string, productSlug: string) {
  return withPublicRead(getDb(), async (db) => {
    const [product] = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        description: schema.products.description,
        coverImageUrl: schema.products.coverImageUrl,
        bodyHtml: schema.products.bodyHtml,
        storeId: schema.stores.id,
        storeName: schema.stores.name,
        storeSlug: schema.stores.slug,
        categoryId: schema.products.categoryId,
      })
      .from(schema.products)
      .innerJoin(
        schema.stores,
        and(
          eq(schema.stores.id, schema.products.storeId),
          eq(schema.stores.slug, storeSlug),
          eq(schema.stores.status, "active"),
        ),
      )
      .where(and(eq(schema.products.slug, productSlug), eq(schema.products.status, "active")))
      .limit(1)

    if (!product) return null

    const [variants, images] = await Promise.all([
      db
        .select({
          id: schema.productVariants.id,
          name: schema.productVariants.name,
          priceSen: schema.productVariants.priceMyrSen,
          stockCount: schema.productVariants.stockCount,
          sku: schema.productVariants.sku,
          attributes: schema.productVariants.attributes,
          sortOrder: schema.productVariants.sortOrder,
          fulfillmentMode: schema.productVariants.fulfillmentMode,
          preorderLeadDays: schema.productVariants.preorderLeadDays,
        })
        .from(schema.productVariants)
        .where(
          and(
            eq(schema.productVariants.productId, product.id),
            eq(schema.productVariants.isActive, true),
          ),
        )
        .orderBy(schema.productVariants.sortOrder),
      db
        .select({
          id: schema.productImages.id,
          url: schema.productImages.url,
          altText: schema.productImages.altText,
          sortOrder: schema.productImages.sortOrder,
        })
        .from(schema.productImages)
        .where(eq(schema.productImages.productId, product.id))
        .orderBy(
          asc(schema.productImages.sortOrder),
          asc(schema.productImages.createdAt),
          asc(schema.productImages.id),
        ),
    ])

    return {
      ...product,
      variants: variants.map((v) => ({ ...v, priceSen: Number(v.priceSen) })),
      images,
    }
  })
}
