// Types only. The shape `getHomeData()` returns and every home section reads.
export interface HomeProduct {
  id: string
  name: string
  slug: string
  storeName: string
  storeSlug: string
  coverImageUrl: string | null
  coverIsCutout: boolean
  categoryName: string | null
  minPriceSen: number | null
  createdAt: Date
  activeVariantCount: number
  inStockVariantCount: number
}

// The newest active product that has a cover image. The price is absent when no active variant has one.
export interface HomeFeatured {
  id: string
  name: string
  slug: string
  storeName: string
  storeSlug: string
  coverImageUrl: string
  minPriceSen: number | null
}

export interface HomeCategory {
  id: string
  name: string
  activeProductCount: number
}

export interface HomeBrand {
  id: string
  name: string
  slug: string
  excerpt: string | null
  productCount: number
}

export interface HomeData {
  featured: HomeFeatured | null
  favourites: HomeProduct[]
  categories: HomeCategory[]
  brands: HomeBrand[]
  counts: { brands: number; products: number; categories: number }
}
