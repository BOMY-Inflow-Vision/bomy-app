import { and, asc, count, desc, eq, isNotNull, ne, sql } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

import { getProducts } from "@/app/products/queries"

import type { HomeBrand, HomeCategory, HomeData, HomeFeatured, HomeProduct } from "./home-types"

// Every read here is a separate read-only withPublicRead call (getProducts opens its own public-read
// transaction, the others open theirs). The page does not need one snapshot across them. Nothing
// here uses the admin-bypass helper, so a home page load writes no audit row.

const FAVOURITES = 8
const CATEGORY_CAP = 12
const BRAND_CAP = 3

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

// The newest active product on an active store that has a cover image. Its own query: the first
// page of getProducts is only 20 rows, so an older product with a cover would be missed whenever 20
// newer ones have none. The price is null when no active variant has one.
export async function getFeatured(): Promise<HomeFeatured | null> {
  return withPublicRead(getDb(), async (db) => {
    const rows = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        storeName: schema.stores.name,
        storeSlug: schema.stores.slug,
        coverImageUrl: schema.products.coverImageUrl,
        minPriceSen: sql<string | null>`min(${schema.productVariants.priceMyrSen})`,
      })
      .from(schema.products)
      .innerJoin(
        schema.stores,
        and(eq(schema.stores.id, schema.products.storeId), eq(schema.stores.status, "active")),
      )
      .leftJoin(
        schema.productVariants,
        and(
          eq(schema.productVariants.productId, schema.products.id),
          eq(schema.productVariants.isActive, true),
        ),
      )
      .where(
        and(
          eq(schema.products.status, "active"),
          isNotNull(schema.products.coverImageUrl),
          ne(schema.products.coverImageUrl, ""),
        ),
      )
      .groupBy(
        schema.products.id,
        schema.products.name,
        schema.products.slug,
        schema.products.coverImageUrl,
        schema.products.createdAt,
        schema.stores.name,
        schema.stores.slug,
      )
      .orderBy(desc(schema.products.createdAt), desc(schema.products.id))
      .limit(1)
    const r = rows[0]
    if (!r || !r.coverImageUrl) return null
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      storeName: r.storeName,
      storeSlug: r.storeSlug,
      coverImageUrl: r.coverImageUrl,
      minPriceSen: r.minPriceSen != null ? Number(r.minPriceSen) : null,
    }
  })
}

// The 8 newest products: the first 8 of getProducts page 1.
export async function getFavourites(): Promise<HomeProduct[]> {
  const { products } = await getProducts({ page: 1 })
  return products.slice(0, FAVOURITES).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    storeName: p.storeName,
    storeSlug: p.storeSlug,
    coverImageUrl: p.coverImageUrl,
    coverIsCutout: p.coverIsCutout,
    categoryName: p.categoryName,
    minPriceSen: p.minPriceSen,
    createdAt: p.createdAt,
    activeVariantCount: p.activeVariantCount,
    inStockVariantCount: p.inStockVariantCount,
  }))
}

// Active categories that have at least one active product on an active store, most products first.
export async function getCategoriesWithCounts(): Promise<HomeCategory[]> {
  return withPublicRead(getDb(), async (db) => {
    const rows = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        activeProductCount: count(schema.products.id),
      })
      .from(schema.categories)
      .innerJoin(
        schema.products,
        and(
          eq(schema.products.categoryId, schema.categories.id),
          eq(schema.products.status, "active"),
        ),
      )
      .innerJoin(
        schema.stores,
        and(eq(schema.stores.id, schema.products.storeId), eq(schema.stores.status, "active")),
      )
      .where(eq(schema.categories.isActive, true))
      .groupBy(schema.categories.id, schema.categories.name)
      .orderBy(desc(count(schema.products.id)), asc(schema.categories.name))
    return rows.map((r) => ({ ...r, activeProductCount: Number(r.activeProductCount) }))
  })
}

// The top three active stores by active product count (at least one product).
export async function getTopBrands(): Promise<HomeBrand[]> {
  return withPublicRead(getDb(), async (db) => {
    const rows = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        slug: schema.stores.slug,
        excerpt: schema.stores.excerpt,
        productCount: count(schema.products.id),
      })
      .from(schema.stores)
      .innerJoin(
        schema.products,
        and(eq(schema.products.storeId, schema.stores.id), eq(schema.products.status, "active")),
      )
      .where(eq(schema.stores.status, "active"))
      .groupBy(schema.stores.id)
      .orderBy(desc(count(schema.products.id)), asc(schema.stores.name), asc(schema.stores.id))
      .limit(BRAND_CAP)
    return rows.map((r) => ({ ...r, productCount: Number(r.productCount) }))
  })
}

// Real counts: active stores with a product, active products on active stores.
export async function getCounts(): Promise<{ brands: number; products: number }> {
  return withPublicRead(getDb(), async (db) => {
    const [products] = await db
      .select({ n: count() })
      .from(schema.products)
      .innerJoin(
        schema.stores,
        and(eq(schema.stores.id, schema.products.storeId), eq(schema.stores.status, "active")),
      )
      .where(eq(schema.products.status, "active"))
    const [brands] = await db
      .select({ n: sql<number>`count(distinct ${schema.stores.id})` })
      .from(schema.stores)
      .innerJoin(
        schema.products,
        and(eq(schema.products.storeId, schema.stores.id), eq(schema.products.status, "active")),
      )
      .where(eq(schema.stores.status, "active"))
    return { brands: Number(brands?.n ?? 0), products: Number(products?.n ?? 0) }
  })
}

export interface HomeDeps {
  featured: () => Promise<HomeFeatured | null>
  favourites: () => Promise<HomeProduct[]>
  categories: () => Promise<HomeCategory[]>
  brands: () => Promise<HomeBrand[]>
  counts: () => Promise<{ brands: number; products: number }>
}

const DEFAULT_DEPS: HomeDeps = {
  featured: getFeatured,
  favourites: getFavourites,
  categories: getCategoriesWithCounts,
  brands: getTopBrands,
  counts: getCounts,
}

export async function getHomeData(deps: HomeDeps = DEFAULT_DEPS): Promise<HomeData> {
  const [featured, favourites, allCategories, brands, counts] = await Promise.all([
    deps.featured(),
    deps.favourites(),
    deps.categories(),
    deps.brands(),
    deps.counts(),
  ])
  return {
    featured,
    favourites,
    // The stats tile counts every category with a product; the page shows the top few.
    categories: allCategories.slice(0, CATEGORY_CAP),
    brands,
    counts: { brands: counts.brands, products: counts.products, categories: allCategories.length },
  }
}
