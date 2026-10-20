import { cn } from "@/lib/utils"

export interface PageHeadingProps {
  title: string
  /** Rendered under the title; nothing is rendered for null, undefined or an empty string. */
  description?: string | null | undefined
  align?: "start" | "center"
  className?: string
}

// The one page-title scale for the storefront. Seller-supplied titles (a store name) may be one
// long unbroken word, so the title and the description may break anywhere and the header may
// shrink inside a flex or grid parent.
export function PageHeading({ title, description, align = "start", className }: PageHeadingProps) {
  return (
    <header className={cn("min-w-0", align === "center" && "text-center", className)}>
      <h1 className="min-w-0 text-3xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-base text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
      ) : null}
    </header>
  )
}
