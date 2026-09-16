import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const ELLIPSIS = "ellipsis" as const
type PageItem = number | typeof ELLIPSIS

const SIBLINGS = 1
const STAGGER_MS = 20

// Always shows page 1 and the last page; fills in up to `siblings` pages on either
// side of the current page, collapsing any gap into a single ellipsis.
function buildPageRange(page: number, totalPages: number, siblings = SIBLINGS): PageItem[] {
  const totalSlots = siblings * 2 + 5
  if (totalPages <= totalSlots) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(page - siblings, 2)
  const rightSibling = Math.min(page + siblings, totalPages - 1)
  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < totalPages - 1

  const items: PageItem[] = [1]
  if (showLeftEllipsis) {
    items.push(ELLIPSIS)
  } else {
    for (let i = 2; i < leftSibling; i++) items.push(i)
  }
  for (let i = leftSibling; i <= rightSibling; i++) items.push(i)
  if (showRightEllipsis) {
    items.push(ELLIPSIS)
  } else {
    for (let i = rightSibling + 1; i < totalPages; i++) items.push(i)
  }
  items.push(totalPages)
  return items
}

export function Pagination({
  page,
  totalPages,
  buildHref,
  className,
}: {
  page: number
  totalPages: number
  buildHref: (page: number) => string
  className?: string
}) {
  if (totalPages <= 1) return null
  const items = buildPageRange(page, totalPages)

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex justify-center border-t border-border px-4 py-3", className)}
    >
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              icon={<ChevronLeft />}
              arrowOnHover={false}
              className="gap-1 px-2.5"
            >
              <Link href={buildHref(page - 1)}>
                <span className="hidden sm:inline">Previous</span>
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft />}
              arrowOnHover={false}
              disabled
              className="gap-1 px-2.5"
            >
              <span className="hidden sm:inline">Previous</span>
            </Button>
          )}
        </li>

        {items.map((item, index) =>
          item === ELLIPSIS ? (
            <li
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="flex size-9 animate-fade-rise-in items-center justify-center text-sm text-muted-foreground motion-reduce:animate-none"
              style={{ animationDelay: `${index * STAGGER_MS}ms` }}
            >
              …
            </li>
          ) : (
            <li
              key={item}
              className="animate-fade-rise-in motion-reduce:animate-none"
              style={{ animationDelay: `${index * STAGGER_MS}ms` }}
            >
              {item === page ? (
                <span
                  aria-current="page"
                  className="flex size-9 items-center justify-center rounded-control border border-border bg-background text-sm font-medium text-foreground shadow-sm"
                >
                  {item}
                </span>
              ) : (
                <Link
                  href={buildHref(item)}
                  aria-label={`Go to page ${item}`}
                  className="flex size-9 items-center justify-center rounded-control text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {item}
                </Link>
              )}
            </li>
          ),
        )}

        <li>
          {page < totalPages ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              icon={<ChevronRight />}
              arrowOnHover={false}
              className="gap-1 px-2.5"
            >
              <Link href={buildHref(page + 1)}>
                <span className="hidden sm:inline">Next</span>
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronRight />}
              arrowOnHover={false}
              disabled
              className="gap-1 px-2.5"
            >
              <span className="hidden sm:inline">Next</span>
            </Button>
          )}
        </li>
      </ul>
    </nav>
  )
}
