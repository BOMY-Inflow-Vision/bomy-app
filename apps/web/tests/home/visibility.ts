// The visibility rules for the home page, as data. Section tests and the full-page test both
// iterate VISIBILITY_CASES, so the rules cannot drift apart.
import type { HomeData, HomeProduct } from "@/app/_home/home-types"

export const MARKERS = [
  "hero-headline",
  "hero-featured",
  "hero-featured-price",
  "hero-themed",
  "hero-delivery",
  "marquee",
  "browse",
  "pills",
  "favourites-grid",
  "promise",
  "stats",
  "stat-brands",
  "stat-products",
  "stat-categories",
  "sellers",
  "cta",
] as const
export type Marker = (typeof MARKERS)[number]

export const ALWAYS: Marker[] = ["hero-headline", "hero-delivery", "marquee", "promise", "cta"]

export function product(i: number, over: Partial<HomeProduct> = {}): HomeProduct {
  return {
    id: `p${i}`,
    name: `Product ${i}`,
    slug: `product-${i}`,
    storeName: `Store ${i % 3}`,
    storeSlug: `store-${i % 3}`,
    coverImageUrl: `https://img.test/p${i}.jpg`,
    coverIsCutout: false,
    categoryName: `Category ${i % 3}`,
    minPriceSen: 1000 + i,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    activeVariantCount: 1,
    inStockVariantCount: 1,
    ...over,
  }
}

export const EMPTY: HomeData = {
  featured: null,
  favourites: [],
  categories: [],
  brands: [],
  counts: { brands: 0, products: 0, categories: 0 },
}

const FULL: HomeData = {
  featured: {
    id: "f1",
    name: "Featured Product",
    slug: "featured-product",
    storeName: "Feature Store",
    storeSlug: "feature-store",
    coverImageUrl: "https://img.test/f1.jpg",
    coverIsCutout: false,
    minPriceSen: 4590,
  },
  favourites: Array.from({ length: 8 }, (_, i) => product(i + 1)),
  categories: [
    { id: "c1", name: "Alpha", activeProductCount: 5 },
    { id: "c2", name: "Beta", activeProductCount: 3 },
    { id: "c3", name: "Gamma", activeProductCount: 1 },
  ],
  brands: [
    { id: "b1", name: "Brand One", slug: "brand-one", excerpt: "First brand.", productCount: 4 },
    { id: "b2", name: "Brand Two", slug: "brand-two", excerpt: null, productCount: 2 },
    { id: "b3", name: "Brand Three", slug: "brand-three", excerpt: "Third.", productCount: 1 },
  ],
  counts: { brands: 3, products: 9, categories: 3 },
}

export interface VisibilityCase {
  name: string
  data: HomeData
  present: Marker[]
}

export const VISIBILITY_CASES: VisibilityCase[] = [
  { name: "empty page", data: EMPTY, present: [...ALWAYS] },
  {
    name: "full data",
    data: FULL,
    present: [
      ...ALWAYS,
      "hero-featured",
      "hero-featured-price",
      "hero-themed",
      "browse",
      "pills",
      "favourites-grid",
      "stats",
      "stat-brands",
      "stat-products",
      "stat-categories",
      "sellers",
    ],
  },
  {
    name: "featured product without a price",
    data: { ...FULL, featured: { ...FULL.featured!, minPriceSen: null } },
    present: [
      ...ALWAYS,
      "hero-featured",
      "hero-themed",
      "browse",
      "pills",
      "favourites-grid",
      "stats",
      "stat-brands",
      "stat-products",
      "stat-categories",
      "sellers",
    ],
  },
  {
    name: "products but no category with a product and no brands",
    data: {
      ...FULL,
      categories: [],
      brands: [],
      counts: { brands: 0, products: 9, categories: 0 },
    },
    present: [
      ...ALWAYS,
      "hero-featured",
      "hero-featured-price",
      "hero-themed",
      "favourites-grid",
      "stats",
      "stat-products",
    ],
  },
  {
    name: "one product, one brand, one category",
    data: {
      featured: FULL.featured,
      favourites: [product(1)],
      categories: [{ id: "c1", name: "Alpha", activeProductCount: 1 }],
      brands: [FULL.brands[0]!],
      counts: { brands: 1, products: 1, categories: 1 },
    },
    present: [
      ...ALWAYS,
      "hero-featured",
      "hero-featured-price",
      "hero-themed",
      "browse",
      "pills",
      "favourites-grid",
      "stats",
      "stat-brands",
      "stat-products",
      "stat-categories",
      "sellers",
    ],
  },
]

// More inputs than the page may show: sections must cap them (8 favourites, 5 browse tiles, 3 brands).
export const OVERFULL: HomeData = {
  ...FULL,
  favourites: Array.from({ length: 20 }, (_, i) => product(i + 1)),
  categories: Array.from({ length: 12 }, (_, i) => ({
    id: `c${i}`,
    name: `Category ${i}`,
    activeProductCount: 20 - i,
  })),
  brands: Array.from({ length: 6 }, (_, i) => ({
    id: `b${i}`,
    name: `Brand ${i}`,
    slug: `brand-${i}`,
    excerpt: null,
    productCount: 6 - i,
  })),
}
