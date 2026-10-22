import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { BrandCard } from "@/components/brand-card"

import type { HOME_COPY } from "./home-copy"
import type { HomeBrand } from "./home-types"

const BRAND_LIMIT = 3

// Real brands, three at most, each a BrandCard. With no brand that has a product the section is
// absent.
export function Sellers({
  brands,
  copy,
}: {
  brands: HomeBrand[]
  copy: (typeof HOME_COPY)["sellers"]
}) {
  const shown = brands.filter((b) => b.productCount >= 1).slice(0, BRAND_LIMIT)
  if (shown.length === 0) return null
  return (
    <section data-home="sellers" className="min-w-0">
      <div className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-3">
        <h2 className="min-w-0 font-display text-display-sm text-foreground [overflow-wrap:anywhere]">
          {copy.title}
        </h2>
        <Link
          href="/brands"
          className="inline-flex min-w-0 items-center gap-2 rounded-sm text-sm font-medium text-foreground underline underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy.all}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </div>
      <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((b) => (
          <li key={b.id} className="min-w-0">
            <BrandCard
              href={`/brands/${b.slug}`}
              name={b.name}
              excerpt={b.excerpt}
              productCount={b.productCount}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
