import type { ComponentPropsWithoutRef } from "react"

import { cn } from "@/lib/utils"

export interface PageMainProps extends ComponentPropsWithoutRef<"main"> {
  /** Keep long text and forms in a readable column, centred inside the frame. */
  narrow?: boolean
  /** Classes for the narrow column (only used with `narrow`). */
  innerClassName?: string
}

// The one page frame for the storefront. `max-w-frame` is 1440 px: with the 20 px gutters that is
// 1400 px of content, the same as the nav bar and footer (and the home page).
export function PageMain({
  narrow = false,
  innerClassName,
  className,
  children,
  ...rest
}: PageMainProps) {
  return (
    <main {...rest} className={cn("mx-auto min-w-0 max-w-frame px-3 py-8 sm:px-5", className)}>
      {narrow ? (
        <div className={cn("mx-auto max-w-3xl", innerClassName)}>{children}</div>
      ) : (
        children
      )}
    </main>
  )
}
