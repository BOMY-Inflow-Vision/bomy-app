import { and, asc, eq, isNull } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

const CATEGORY_PREVIEW_CAP = 8

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

    const categorySections: Array<{
      category: { name: string; slug: string }
      products: ProductCard[]
      hasMore: boolean
    }> = []

    for (const category of categories) {
      const products = await db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          slug: schema.products.slug,
          coverImageUrl: schema.products.coverImageUrl,
        })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.storeId, store.id),
            eq(schema.products.status, "active"),
            eq(schema.products.categoryId, category.id),
          ),
        )
        .orderBy(asc(schema.products.createdAt), asc(schema.products.id))
        .limit(CATEGORY_PREVIEW_CAP + 1)

      if (products.length === 0) continue

      categorySections.push({
        category: { name: category.name, slug: category.slug },
        products: products.slice(0, CATEGORY_PREVIEW_CAP),
        hasMore: products.length > CATEGORY_PREVIEW_CAP,
      })
    }

    const uncategorizedProducts = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        coverImageUrl: schema.products.coverImageUrl,
      })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.storeId, store.id),
          eq(schema.products.status, "active"),
          isNull(schema.products.categoryId),
        ),
      )
      .orderBy(asc(schema.products.createdAt), asc(schema.products.id))
      .limit(CATEGORY_PREVIEW_CAP + 1)

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
