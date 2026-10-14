import * as React from "react"

import { Button, type ButtonProps } from "@bomy/ui/button"
import { cn } from "@/lib/utils"

/**
 * The nav bar's round icon control (account link, cart link, theme toggle): the shared Button
 * (ghost, icon size) with the nav's look. Use `asChild` to make a `next/link` the element.
 * `[&_svg]:size-5` overrides Button's 16px icon rule so the icons stay 20px.
 */
export const NavIconButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn(
        "shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  ),
)
NavIconButton.displayName = "NavIconButton"
