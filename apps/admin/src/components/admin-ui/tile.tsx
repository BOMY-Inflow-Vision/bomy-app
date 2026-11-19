import * as React from "react"

import { cn } from "@/lib/utils"

// The admin's one surface: a white tile that floats on the sand page. A soft shadow does the
// separating (a hairline ring in dark mode), so there is no border. Use it for every panel, table
// and form block in the admin; the sidebar and the search box use the same shadow.
export const Tile = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-2xl bg-card text-card-foreground shadow-tile", className)}
      {...props}
    />
  ),
)
Tile.displayName = "Tile"
