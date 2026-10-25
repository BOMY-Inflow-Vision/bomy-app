import Link from "next/link"

import { CoverImage } from "@/components/cover-image"
import { formatMyrSen } from "@/lib/format"

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

// Shared storefront tile: blush 4:5 art area, then category, name, store and price. Renders the
// whole tile as one link; the page keeps its own <li>. The focus ring sits on the link (not
// clipped); the rounded clipping is on the inner wrapper. On hover or keyboard focus only the photo
// layer scales (1.04, 0.7 s), so the badge stays put; touch screens and reduced motion get none.
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
  return (
    <Link
      href={href}
      className="group block min-w-0 rounded-bento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="isolate overflow-hidden rounded-bento border border-border bg-card shadow-sm hover:shadow-md">
        <div className="relative aspect-tile bg-tint">
          <div className="h-full w-full transition-transform duration-700 ease-out-expo motion-reduce:transition-none motion-safe:[@media(hover:hover)]:group-hover:scale-[1.04] motion-safe:group-focus-visible:scale-[1.04]">
            <CoverImage src={coverImageUrl} alt={name} />
          </div>
          {badge && (
            <span className="absolute left-3 top-3 rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground">
              {badge}
            </span>
          )}
        </div>
        <div className="p-4">
          {full && categoryName && (
            <p className="mb-1 truncate font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">
              {categoryName}
            </p>
          )}
          <p className="line-clamp-2 break-words text-base font-medium text-foreground group-hover:text-primary">
            {name}
          </p>
          {full && storeName && (
            <p className="truncate text-sm text-muted-foreground">{storeName}</p>
          )}
          {full && minPriceSen != null && (
            <p className="mt-2 text-sm font-semibold text-primary-text">
              from {formatMyrSen(minPriceSen)}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
