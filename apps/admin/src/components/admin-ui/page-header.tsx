import * as React from "react"

import { cn } from "@/lib/utils"

// The admin's page title row: the title (and an optional line under it) on the left, the page's
// controls (filters, search, the create button) on the right. The row wraps on a narrow screen, so
// the controls drop under the title instead of squeezing it. Titles can be long, so they may break
// anywhere and the title block may shrink.
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  /** The page's controls, laid out in a wrapping row. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn("mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3", className)}
    >
      <div className="min-w-0">
        <h1 className="min-w-0 text-2xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </header>
  )
}
