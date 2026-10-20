import Link from "next/link"

import { Badge } from "@bomy/ui/badge"

export interface BrandCardProps {
  href: string
  name: string
  excerpt?: string | null | undefined
  categories?: string[] | undefined
  productCount: number
}

// The /brands tile. Every text here is seller-supplied and may be one long unbroken word, so all
// of it may break anywhere and the badges wrap inside the card. The focus ring sits on the link;
// the rounded clipping is on the inner wrapper.
export function BrandCard({ href, name, excerpt, categories, productCount }: BrandCardProps) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? ""
  return (
    <Link
      href={href}
      className="group block h-full min-w-0 rounded-bento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-bento border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tint text-lg font-bold text-primary-text"
          >
            {initial}
          </div>
          {categories && categories.length > 0 && (
            <div className="flex min-w-0 flex-wrap justify-end gap-1">
              {categories.map((cat) => (
                <Badge
                  key={cat}
                  className="max-w-full whitespace-normal text-left [overflow-wrap:anywhere]"
                >
                  {cat}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <p className="font-semibold text-foreground group-hover:text-primary [overflow-wrap:anywhere]">
          {name}
        </p>

        {excerpt ? (
          <p className="mt-1 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
            {excerpt}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {productCount} product{productCount !== 1 ? "s" : ""}
        </p>
      </div>
    </Link>
  )
}
