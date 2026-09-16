import { and, asc, desc, eq, lte, sql } from "drizzle-orm"
import { cache } from "react"

import { makeDb, schema, withAdmin, withPublicRead } from "@bomy/db"

const CATEGORY_PREVIEW_CAP = 8
const SUBSCRIBER_AVATAR_CAP = 4
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

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

export const getStorePage = cache(async (slug: string) => {
  return withPublicRead(getDb(), async (db) => {
    const [store] = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        slug: schema.stores.slug,
        description: schema.stores.description,
        excerpt: schema.stores.excerpt,
        bodyHtml: schema.stores.bodyHtml,
        videoId: schema.stores.videoId,
        metaTitle: schema.stores.metaTitle,
        metaDescription: schema.stores.metaDescription,
        ogImageUrl: schema.stores.ogImageUrl,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.slug, slug), eq(schema.stores.status, "active")))
      .limit(1)

    if (!store) return null

    // Deliberately NOT filtered on isActive: a category can be deactivated after a store's
    // products already reference it (admin toggleCategory has no cascade to products.category_id),
    // and this store's active products in that category must still get a section — matching the
    // platform-wide convention (getProducts on /products never filters category isActive either).
    // The only gate on whether a category renders a section is "does this store have any active
    // products in it" (the length check below), independent of the category's own isActive state.
    const categories = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
      })
      .from(schema.categories)
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))

    // Rank each of the store's active products within its own category via row_number() OVER
    // (PARTITION BY category_id ...), then keep only the top CATEGORY_PREVIEW_CAP + 1 rows per
    // category. This replaces a single globally-capped query (STORE_PRODUCTS_SAFETY_CAP): a
    // store with more than that many active products could previously lose entire categories
    // past the truncation point, and hasMore could be wrong for any category whose products
    // landed partly or fully beyond the cutoff. Postgres partitions category_id IS NULL values
    // into their own group under PARTITION BY, so the uncategorized bucket is correctly ranked
    // and capped too — no special-casing needed. Every category's visibility is now independent
    // of every other category's product count, with no global row cap at all.
    const ranked = db.$with("ranked").as(
      db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          slug: schema.products.slug,
          coverImageUrl: schema.products.coverImageUrl,
          categoryId: schema.products.categoryId,
          rn: sql<number>`row_number() over (partition by ${schema.products.categoryId} order by ${schema.products.createdAt} asc, ${schema.products.id} asc)`.as(
            "rn",
          ),
        })
        .from(schema.products)
        .where(and(eq(schema.products.storeId, store.id), eq(schema.products.status, "active"))),
    )

    // Ordering matches the per-category guarantee we need (rn ASC, which itself encodes
    // created_at ASC, id ASC within each category): rn increases monotonically within a given
    // category regardless of how other categories' rows interleave in the result set, so
    // pushing onto each group's array in this order keeps every group sorted without
    // re-sorting downstream.
    const allProducts = await db
      .with(ranked)
      .select({
        id: ranked.id,
        name: ranked.name,
        slug: ranked.slug,
        coverImageUrl: ranked.coverImageUrl,
        categoryId: ranked.categoryId,
      })
      .from(ranked)
      .where(lte(ranked.rn, CATEGORY_PREVIEW_CAP + 1))
      .orderBy(asc(ranked.rn))

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
        excerpt: store.excerpt,
        bodyHtml: store.bodyHtml,
        videoId: store.videoId,
        metaTitle: store.metaTitle,
        metaDescription: store.metaDescription,
        ogImageUrl: store.ogImageUrl,
      },
      categorySections,
      uncategorized: {
        products: uncategorizedProducts.slice(0, CATEGORY_PREVIEW_CAP),
        hasMore: uncategorizedProducts.length > CATEGORY_PREVIEW_CAP,
      },
    }
  })
})

export interface SubscriberAvatar {
  id: string
  image: string | null
  initial: string
}

// RLS's users_self_read policy blocks a public-read context from seeing any other user's
// row, so this narrow admin-bypass read is required to show subscriber avatars on the
// brand page — same pattern as getPriceSen on the membership page. Only avatar image + a
// single initial (no name/email) leave the server, to keep this social proof widget from
// exposing subscribers' identities. Callers should only invoke this for a signed-in
// visitor (see brands/[slug]/page.tsx) — brand_subscriptions carries per-subscriber
// financial/commission columns, so a real public-read RLS policy here would need to open
// row-level SELECT on that table to anonymous traffic, a materially bigger exposure than
// the narrow id/image/initial this function actually returns (PR #145 review, Bob). The
// audit write this still costs on every signed-in brand-page view is tracked as GAPS.md #17.
export const getBrandSubscriberAvatars = cache(async (storeId: string) => {
  return withAdmin(
    getDb(),
    {
      userId: SYSTEM_ACTOR,
      reason: "read brand subscriber avatars for a signed-in visitor's brand page view",
    },
    async (tx) => {
      const rows = await tx
        .select({
          id: schema.users.id,
          image: schema.users.image,
          name: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.brandSubscriptions)
        .innerJoin(schema.users, eq(schema.users.id, schema.brandSubscriptions.userId))
        .where(
          and(
            eq(schema.brandSubscriptions.storeId, storeId),
            eq(schema.brandSubscriptions.status, "active"),
          ),
        )
        .orderBy(desc(schema.brandSubscriptions.createdAt))
        .limit(SUBSCRIBER_AVATAR_CAP)

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.brandSubscriptions)
        .where(
          and(
            eq(schema.brandSubscriptions.storeId, storeId),
            eq(schema.brandSubscriptions.status, "active"),
          ),
        )

      const avatars: SubscriberAvatar[] = rows.map((row) => ({
        id: row.id,
        image: row.image,
        initial: (row.name ?? row.email)[0]!.toUpperCase(),
      }))

      return { avatars, total: countRow?.count ?? 0 }
    },
  )
})
