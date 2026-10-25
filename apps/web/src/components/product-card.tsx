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

// Shared storefront tile (Kvist shop look): a blush 4:5 picture tile with no border or shadow, then
// the text under it on a two-column row: category above, name on the left and price on the right,
// store below. Renders the whole tile as one link; the page keeps its own <li>. The focus ring sits
// on the link (not clipped); the rounded clipping is on the tile. On hover or keyboard focus only
// the photo layer scales (1.04, 0.7 s), so the badge stays put; touch screens and reduced motion
// get none.
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
      <div className="relative isolate aspect-tile overflow-hidden rounded-bento bg-tint">
        <div className="h-full w-full transition-transform duration-700 ease-out-expo motion-reduce:transition-none motion-safe:[@media(hover:hover)]:group-hover:scale-[1.04] motion-safe:group-focus-visible:scale-[1.04]">
          <CoverImage src={coverImageUrl} alt={name} />
        </div>
        {badge && (
          <span className="absolute left-3 top-3 rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-1 pt-3 sm:px-1.5 sm:pt-4">
        {full && categoryName && (
          <p className="col-span-2 mb-1 truncate text-xs text-muted-foreground">{categoryName}</p>
        )}
        <p
          className={cn(
            "line-clamp-2 min-w-0 break-words text-base font-medium leading-snug text-foreground group-hover:text-primary",
            showPrice ? "col-span-2 sm:col-span-1" : "col-span-2",
          )}
        >
          {name}
        </p>
        {showPrice && (
          <p className="col-span-2 mt-1 whitespace-nowrap text-base font-semibold text-primary-text sm:col-span-1 sm:mt-0">
            from {formatMyrSen(minPriceSen)}
          </p>
        )}
        {full && storeName && (
          <p className="col-span-2 truncate text-sm text-muted-foreground">{storeName}</p>
        )}
      </div>
    </Link>
  )
}
