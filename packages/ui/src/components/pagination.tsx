import * as React from "react"

import { cn } from "../lib/utils.js"

// Page numbers to show: every page up to 7, otherwise 1 … current±1 … last.
function pageRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "...")[] = [1]
  if (current > 3) pages.push("...")
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push("...")
  pages.push(total)
  return pages
}

const SIZE = {
  md: "h-8 w-8",
  lg: "h-11 w-11",
} as const

export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  page: number
  totalPages: number
  /** The full href of a page. Each page keeps its own URL building. */
  buildHref: (page: number) => string
  /** Accessible name of the nav, for example "Products pagination". */
  label: string
  /** md is 32 px (products), lg is 44 px (brands). */
  size?: keyof typeof SIZE
  /** Collapse long ranges with an ellipsis. Off shows every page number. */
  collapse?: boolean
  /** The link component, for example next/link. Defaults to a plain anchor. */
  linkAs?: React.ElementType
}

function Pagination({
  page,
  totalPages,
  buildHref,
  label,
  size = "md",
  collapse = false,
  linkAs: LinkComp = "a",
  className,
  ...props
}: PaginationProps) {
  if (totalPages <= 1) return null
  const items: (number | "...")[] = collapse
    ? pageRange(page, totalPages)
    : Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <nav aria-label={label} className={className} {...props}>
      {items.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className={cn(
              "flex items-center justify-center text-sm text-muted-foreground",
              SIZE[size],
            )}
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <LinkComp
            key={p}
            href={buildHref(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "flex items-center justify-center rounded-control text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              SIZE[size],
              p === page
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {p}
          </LinkComp>
        ),
      )}
    </nav>
  )
}

export { Pagination, pageRange }
