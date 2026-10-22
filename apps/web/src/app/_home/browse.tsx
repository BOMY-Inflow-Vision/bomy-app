import { ArrowRight } from "lucide-react"
import Link from "next/link"

import type { HOME_COPY } from "./home-copy"
import type { HomeCategory } from "./home-types"

const TILE_LIMIT = 5
const TONES = ["bg-tint", "bg-secondary", "bg-card border border-border"] as const

// Category tiles that link to the filtered product list. Only categories with at least one active
// product count; with none, the whole section is absent rather than an empty frame.
export function Browse({
  categories,
  copy,
}: {
  categories: HomeCategory[]
  copy: (typeof HOME_COPY)["browse"]
}) {
  const tiles = categories
    .filter((c) => c.activeProductCount >= 1)
    .sort((a, b) => b.activeProductCount - a.activeProductCount)
    .slice(0, TILE_LIMIT)
  if (tiles.length === 0) return null

  return (
    <section data-home="browse" className="min-w-0">
      <div className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-3">
        <h2 className="min-w-0 font-display text-display-sm text-foreground [overflow-wrap:anywhere]">
          {copy.title}
        </h2>
        <Link
          href="/products"
          className="inline-flex min-w-0 items-center gap-2 rounded-sm text-sm font-medium text-foreground underline underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy.all}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </div>
      <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((c, i) => (
          <li key={c.id} className="min-w-0">
            <Link
              href={`/products?category=${encodeURIComponent(c.id)}`}
              className={`group flex h-full min-w-0 flex-col justify-between gap-6 rounded-bento p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${TONES[i % TONES.length]}`}
            >
              <span className="min-w-0 text-xl font-medium text-foreground [overflow-wrap:anywhere] group-hover:text-primary">
                {c.name}
              </span>
              <span className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {copy.count(c.activeProductCount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
