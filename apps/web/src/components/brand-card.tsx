import Link from "next/link"

import { PICTURE_BASE, toneFor } from "@/components/product-card"
import { cn } from "@/lib/utils"

export interface BrandCardProps {
  href: string
  name: string
  excerpt?: string | null | undefined
  categories?: string[] | undefined
  productCount: number
}

// The /brands tile, built like the product card: a pastel 4:5 tile (the tone is stable per brand),
// then the text under it. A brand has no picture, so the tile carries the brand's first letter; it
// lifts and turns on hover and keyboard focus exactly like a product photo. Under the tile: the
// categories on one line, the name, a short excerpt, and the product count on the right where the
// product card shows its price. Every text here is seller-supplied and may be one long unbroken
// word, so all of it may break anywhere. The focus ring sits on the link; the rounded clipping is
// on the tile.
export function BrandCard({ href, name, excerpt, categories, productCount }: BrandCardProps) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? ""
  const categoryLine = categories && categories.length > 0 ? categories.join(" · ") : null
  return (
    <Link
      href={href}
      className="group block h-full min-w-0 rounded-bento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div
        data-tile
        className={cn("relative isolate aspect-tile overflow-hidden rounded-bento", toneFor(href))}
      >
        <div
          aria-hidden="true"
          className={cn(
            PICTURE_BASE,
            "inset-0 flex items-center justify-center font-display text-8xl font-bold text-foreground/70 motion-safe:[@media(hover:hover)]:group-hover:scale-110 motion-safe:group-focus-visible:scale-110",
          )}
        >
          {initial}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-1 pt-3 sm:px-1.5 sm:pt-4">
        {categoryLine && (
          <p className="col-span-2 line-clamp-1 text-xs text-muted-foreground [overflow-wrap:anywhere] lg:text-card-meta">
            {categoryLine}
          </p>
        )}
        <p className="col-span-2 line-clamp-2 min-w-0 text-card-name-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere] group-hover:text-primary lg:col-span-1 lg:text-card-name">
          {name}
        </p>
        <p className="col-span-2 mt-1 text-xs text-muted-foreground lg:col-span-1 lg:col-start-2 lg:row-start-2 lg:mt-0 lg:self-end lg:whitespace-nowrap lg:text-card-meta">
          {productCount} product{productCount !== 1 ? "s" : ""}
        </p>
        {excerpt ? (
          <p className="col-span-2 mt-1 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere] lg:text-card-meta">
            {excerpt}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
