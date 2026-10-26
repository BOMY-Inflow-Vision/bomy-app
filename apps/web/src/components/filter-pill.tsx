import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Link-based, URL-driven category pills for the storefront (web only; the shared FilterTabs in
// @bomy/ui is untouched). Like FilterTabs these are navigation links, not an ARIA tab widget: no
// tablist/tab roles, Tab and Enter work as for any link, and the active pill carries
// aria-current="page". The label may break anywhere so a long unbroken category name stays inside
// the pill (and the pill inside a 320 px viewport).
const pill = cva(
  "inline-flex min-h-11 max-w-full items-center rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      active: {
        true: "bg-foreground text-background",
        false: "text-muted-foreground hover:bg-card hover:text-foreground",
      },
    },
    defaultVariants: { active: false },
  },
)

export interface FilterPillsProps extends React.HTMLAttributes<HTMLElement> {
  /** Accessible name of the group, for example "Filter by category". */
  label: string
}

export function FilterPills({ label, className, ...props }: FilterPillsProps) {
  return (
    <nav
      aria-label={label}
      className={cn("flex min-w-0 flex-wrap gap-1 rounded-3xl bg-muted p-1", className)}
      {...props}
    />
  )
}

export interface FilterPillProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean
  asChild?: boolean
}

export const FilterPill = React.forwardRef<HTMLAnchorElement, FilterPillProps>(
  ({ className, active = false, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "a"
    return (
      <Comp
        ref={ref}
        aria-current={active ? "page" : undefined}
        className={cn(pill({ active }), className)}
        {...props}
      />
    )
  },
)
FilterPill.displayName = "FilterPill"

// Pill classes for use inside the rail: a fixed-size pill in the phone row, a full-width line in the
// lg column (where a long name may wrap).
export const RAIL_PILL =
  "shrink-0 whitespace-nowrap lg:w-full lg:justify-start lg:whitespace-normal"
