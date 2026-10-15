import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils.js"

// A navigation link in a dark sidebar: the seller dashboard sidebar (which becomes a scrolling tab
// strip on small screens) and the admin sidebar. The active link carries aria-current="page"; an
// inactive link has no aria-current attribute. Which link is active is the caller's decision.
const sidebarLinkVariants = cva(
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
  {
    variants: {
      orientation: {
        list: "",
        strip: "whitespace-nowrap",
      },
      active: {
        true: "",
        false: "hover:bg-sidebar-accent hover:text-sidebar-strong",
      },
    },
    compoundVariants: [
      {
        orientation: "list",
        active: true,
        className: "border-l-2 border-sidebar-indicator bg-sidebar-accent text-sidebar-strong",
      },
      {
        // Below md the strip marks the active tab underneath; from md it is a list again.
        orientation: "strip",
        active: true,
        className:
          "border-b-2 border-sidebar-indicator bg-sidebar-accent text-sidebar-strong md:border-b-0 md:border-l-2",
      },
    ],
    defaultVariants: { orientation: "list", active: false },
  },
)

export interface SidebarLinkProps
  extends
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children">,
    Omit<VariantProps<typeof sidebarLinkVariants>, "active"> {
  active?: boolean
  asChild?: boolean
  children?: React.ReactNode
}

const SidebarLink = React.forwardRef<HTMLAnchorElement, SidebarLinkProps>(
  ({ className, orientation, active = false, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "a"
    return (
      <Comp
        ref={ref}
        aria-current={active ? "page" : undefined}
        className={cn(sidebarLinkVariants({ orientation, active }), className)}
        {...props}
      />
    )
  },
)
SidebarLink.displayName = "SidebarLink"

export { SidebarLink, sidebarLinkVariants }
