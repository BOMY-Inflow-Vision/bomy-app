import * as React from "react"

import { cn } from "@/lib/utils"

// The admin's page container: the same gutters on every page, centred, with a cap on very wide
// screens. `narrow` is for a form or a single record; `wide` (the default) is for lists and tables.
export function PageFrame({
  width = "wide",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { width?: "wide" | "narrow" }) {
  return (
    <div
      className={cn(
        "mx-auto px-4 py-6 md:px-6 lg:px-8 lg:py-9",
        width === "wide" ? "max-w-7xl" : "max-w-3xl",
        className,
      )}
      {...props}
    />
  )
}
