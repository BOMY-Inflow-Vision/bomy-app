import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const ELLIPSIS = "ellipsis" as const
type PageItem = number | typeof ELLIPSIS

const SIBLINGS = 1

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

// After TillyTop's pager: "Page x of y" on the left, Previous / numbers / Next in the middle. On a
// phone the numbers drop to their own row and Previous/Next keep only their arrows.
const STEP =
  "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors hover:bg-foreground/[.06] max-sm:px-2.5"
const STEP_OFF = "pointer-events-none opacity-35"
const NUMBER =
  "grid size-9 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors"

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
  const prev = page > 1
  const next = page < totalPages

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pb-3 pt-4",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Page <span className="font-semibold tabular-nums text-foreground">{page}</span> of{" "}
        <span className="font-semibold tabular-nums text-foreground">{totalPages}</span>
      </p>

      <ul className="order-last flex w-full items-center justify-center gap-1 md:order-none md:w-auto">
        <li>
          <Link
            href={buildHref(prev ? page - 1 : 1)}
            aria-disabled={!prev}
            tabIndex={prev ? undefined : -1}
            className={cn(STEP, !prev && STEP_OFF)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Previous</span>
          </Link>
        </li>

        {items.map((item, index) =>
          item === ELLIPSIS ? (
            <li
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className={cn(NUMBER, "text-muted-foreground")}
            >
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span aria-current="page" className={cn(NUMBER, "bg-foreground text-background")}>
                  {item}
                </span>
              ) : (
                <Link
                  href={buildHref(item)}
                  aria-label={`Go to page ${item}`}
                  className={cn(NUMBER, "hover:bg-foreground/[.06]")}
                >
                  {item}
                </Link>
              )}
            </li>
          ),
        )}

        <li>
          <Link
            href={buildHref(next ? page + 1 : totalPages)}
            aria-disabled={!next}
            tabIndex={next ? undefined : -1}
            className={cn(STEP, !next && STEP_OFF)}
          >
            <span className="max-sm:sr-only">Next</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </li>
      </ul>
    </nav>
  )
}
