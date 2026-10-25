import Link from "next/link"

import { CoverImage } from "@/components/cover-image"
import { formatMyrSen } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface ProductCardProps {
  href: string
  name: string
  coverImageUrl: string | null
  /** `compact` shows the image and the name only (brand pages). Default `full`. */
  variant?: "full" | "compact"
  categoryName?: string | null
  storeName?: string | null
  minPriceSen?: number | null
  /** A badge proved by real data (see productBadge). Absent or null shows none. */
  badge?: "New" | "Sold out" | null
}

// The six Kvist tile pastels. Full class names, so Tailwind sees them.
export const TILE_TONES = [
  "bg-tile-sage",
  "bg-tile-butter",
  "bg-tile-sky",
  "bg-tile-sand",
  "bg-tile-stone",
  "bg-tile-blush",
] as const

// A stable tone per product (from its link), so a product keeps its colour on every page.
function toneFor(href: string) {
  let h = 0
  for (let i = 0; i < href.length; i++) h = (h * 31 + href.charCodeAt(i)) >>> 0
  return TILE_TONES[h % TILE_TONES.length]!
}

// Shared storefront tile, the Kvist shop card value for value (measured 2026-10-25): a pastel 4:5
// tile with a cut-out picture inset 11% and a soft oval shadow under it, then the text under the
// tile: category, name, store, and the price on the right (from lg; on a phone the price is its own
// right-aligned line). Renders the whole tile as one link; the page keeps its own <li>. The focus
// ring sits on the link (not clipped); the rounded clipping is on the tile. On hover or keyboard
// focus the picture lifts 14 px and turns -2 deg and the shadow thins (0.7 s ease-out-expo); touch
// screens and reduced motion get none.
export function ProductCard({
  href,
  name,
  coverImageUrl,
  variant = "full",
  categoryName,
  storeName,
  minPriceSen,
  badge,
}: ProductCardProps) {
  const full = variant === "full"
  const showPrice = full && minPriceSen != null
  return (
    <Link
      href={href}
      className="group block min-w-0 rounded-bento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div
        className={cn("relative isolate aspect-tile overflow-hidden rounded-bento", toneFor(href))}
      >
        <span
          aria-hidden="true"
          className="absolute bottom-[13%] left-1/2 h-6 w-[58%] -translate-x-1/2 rounded-[50%] bg-ink/25 opacity-[0.55] blur-md transition-[opacity,transform] duration-700 ease-out-expo motion-reduce:transition-none motion-safe:[@media(hover:hover)]:group-hover:opacity-[0.32] motion-safe:[@media(hover:hover)]:group-hover:scale-x-[0.78] motion-safe:group-focus-visible:opacity-[0.32] motion-safe:group-focus-visible:scale-x-[0.78]"
        />
        <div className="absolute inset-[11%] bottom-[15%] transition-transform duration-700 ease-out-expo motion-reduce:transition-none motion-safe:[@media(hover:hover)]:group-hover:-translate-y-3.5 motion-safe:[@media(hover:hover)]:group-hover:-rotate-2 motion-safe:group-focus-visible:-translate-y-3.5 motion-safe:group-focus-visible:-rotate-2">
          <CoverImage src={coverImageUrl} alt={name} fit="contain" />
        </div>
        {badge && (
          <span className="absolute left-4 top-4 z-10 rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
            {badge}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-1 pt-3 sm:px-1.5 sm:pt-4">
        {full && categoryName && (
          <p className="col-span-2 truncate text-xs text-muted-foreground lg:col-span-1 lg:row-start-1 lg:text-card-meta">
            {categoryName}
          </p>
        )}
        <p
          className={cn(
            "col-span-2 line-clamp-2 min-w-0 break-words text-card-name-sm font-medium leading-snug text-foreground lg:row-start-2 lg:line-clamp-1 lg:text-card-name",
            showPrice ? "lg:col-span-1" : "lg:col-span-2",
          )}
        >
          {name}
        </p>
        {full && storeName && (
          <p className="col-span-2 mt-1 truncate text-xs text-muted-foreground lg:col-span-1 lg:row-start-3 lg:text-card-meta">
            {storeName}
          </p>
        )}
        {showPrice && (
          <p className="col-span-2 mt-1 text-right font-display text-card-name font-semibold tabular-nums text-foreground [overflow-wrap:anywhere] lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-end lg:whitespace-nowrap lg:text-xl">
            from {formatMyrSen(minPriceSen)}
          </p>
        )}
      </div>
    </Link>
  )
}
