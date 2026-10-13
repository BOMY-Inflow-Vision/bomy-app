import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils.js"

// Link-based, URL-driven filter chips. These are navigation links, not an ARIA tab widget: no
// tablist/tab roles and no arrow-key roving, so Tab, Shift+Tab and Enter work as for any link.
// The active chip carries aria-current="page". Three looks are kept as they were on each page.
const filterTabVariants = cva(
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        primary: "rounded-full px-3 py-1 text-xs font-medium",
        inverse: "rounded-full px-3 py-1 text-sm",
        flat: "rounded px-3 py-1",
      },
      active: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "primary", active: true, className: "bg-primary text-primary-foreground" },
      {
        variant: "primary",
        active: false,
        className: "bg-muted text-muted-foreground hover:bg-muted/80",
      },
      { variant: "inverse", active: true, className: "bg-foreground text-background" },
      { variant: "inverse", active: false, className: "bg-muted text-muted-foreground" },
      { variant: "flat", active: true, className: "bg-accent text-accent-foreground" },
      {
        variant: "flat",
        active: false,
        className: "text-muted-foreground hover:bg-muted",
      },
    ],
    defaultVariants: { variant: "primary", active: false },
  },
)

export interface FilterTabsProps extends React.HTMLAttributes<HTMLElement> {
  /** Accessible name of the group, for example "Filter by status". */
  label: string
}

function FilterTabs({ label, className, ...props }: FilterTabsProps) {
  return <nav aria-label={label} className={cn("flex flex-wrap", className)} {...props} />
}

export interface FilterTabProps
  extends
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children">,
    Omit<VariantProps<typeof filterTabVariants>, "active"> {
  active?: boolean
  asChild?: boolean
  children?: React.ReactNode
}

const FilterTab = React.forwardRef<HTMLAnchorElement, FilterTabProps>(
  ({ className, variant, active = false, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "a"
    return (
      <Comp
        ref={ref}
        aria-current={active ? "page" : undefined}
        className={cn(filterTabVariants({ variant, active }), className)}
        {...props}
      />
    )
  },
)
FilterTab.displayName = "FilterTab"

export { FilterTabs, FilterTab, filterTabVariants }
