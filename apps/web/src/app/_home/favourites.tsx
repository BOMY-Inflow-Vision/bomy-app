import Link from "next/link"

import { FilterPill, FilterPills } from "@/components/filter-pill"
import { ProductCard } from "@/components/product-card"
import { productBadge } from "@/lib/product-badge"

import type { HOME_COPY } from "./home-copy"
import type { HomeCategory, HomeProduct } from "./home-types"

const CARD_LIMIT = 8

// The newest products with category shortcuts. With no products the whole section is absent: no
// heading, no empty frame, no pills that lead nowhere. `now` is only for tests.
export function Favourites({
  products,
  categories,
  copy,
  now = new Date(),
}: {
  products: HomeProduct[]
  categories: HomeCategory[]
  copy: (typeof HOME_COPY)["favourites"]
  now?: Date
}) {
  if (products.length === 0) return null
  const pills = categories.filter((c) => c.activeProductCount >= 1)

  return (
    <section className="min-w-0">
      <div className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-3">
        <h2 className="min-w-0 font-display text-display-sm text-foreground [overflow-wrap:anywhere]">
          {copy.title}
        </h2>
      </div>
      {pills.length > 0 ? (
        <FilterPills data-home="pills" label={copy.pillsLabel} className="mb-6">
          <FilterPill asChild>
            <Link href="/products">{copy.all}</Link>
          </FilterPill>
          {pills.map((c) => (
            <FilterPill key={c.id} asChild>
              <Link href={`/products?category=${encodeURIComponent(c.id)}`}>{c.name}</Link>
            </FilterPill>
          ))}
        </FilterPills>
      ) : null}
      <ul data-home="favourites-grid" className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-4">
        {products.slice(0, CARD_LIMIT).map((p) => (
          <li key={p.id} className="min-w-0">
            <ProductCard
              href={`/products/${p.storeSlug}/${p.slug}`}
              name={p.name}
              coverImageUrl={p.coverImageUrl}
              categoryName={p.categoryName}
              storeName={p.storeName}
              minPriceSen={p.minPriceSen}
              badge={productBadge({
                createdAt: p.createdAt,
                activeVariantCount: p.activeVariantCount,
                inStockVariantCount: p.inStockVariantCount,
                now,
              })}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
