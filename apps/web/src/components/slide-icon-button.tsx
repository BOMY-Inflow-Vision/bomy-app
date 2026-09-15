import * as React from "react"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"

interface SlideIconButtonProps extends ButtonProps {
  icon: React.ReactNode
  arrowOnHover?: boolean
}

// The row is offset by half of (icon + gap) so the visible icon/label pair stays centred in both states.
const SlideIconButton = React.forwardRef<HTMLButtonElement, SlideIconButtonProps>(
  ({ icon, arrowOnHover = true, className, children, ...props }, ref) => (
    <Button
      ref={ref}
      className={cn(
        "group/slide rounded-full px-3 transition-[background-color,transform] duration-150 hover:scale-[1.02] active:scale-[0.96] motion-reduce:transform-none",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex translate-x-[13px] items-center gap-2.5 transition-transform duration-500 ease-spring motion-reduce:transition-none",
          arrowOnHover &&
            "group-focus-visible/slide:-translate-x-[13px] [@media(hover:hover)]:group-hover/slide:-translate-x-[13px]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex transition-[opacity,transform] duration-500 ease-spring motion-reduce:transition-none",
            arrowOnHover &&
              "group-focus-visible/slide:-translate-x-2.5 group-focus-visible/slide:opacity-0 [@media(hover:hover)]:group-hover/slide:-translate-x-2.5 [@media(hover:hover)]:group-hover/slide:opacity-0",
          )}
        >
          {icon}
        </span>
        <span>{children}</span>
        <span
          aria-hidden="true"
          className={cn(
            "flex translate-x-2.5 opacity-0 transition-[opacity,transform] duration-500 ease-spring motion-reduce:transition-none",
            arrowOnHover &&
              "group-focus-visible/slide:translate-x-0 group-focus-visible/slide:opacity-100 [@media(hover:hover)]:group-hover/slide:translate-x-0 [@media(hover:hover)]:group-hover/slide:opacity-100",
          )}
        >
          <ArrowRight />
        </span>
      </span>
    </Button>
  ),
)
SlideIconButton.displayName = "SlideIconButton"

export { SlideIconButton }
