import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:brightness-90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        reward: "bg-reward text-reward-foreground shadow-sm hover:brightness-90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-control px-3 text-xs",
        lg: "h-10 rounded-control px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

// --slide is half of (16px icon + row gap): the row is offset by it so the visible icon/label pair
// stays centred while the trailing arrow slot sits hidden in the padding.
const SLIDE_SIZE = {
  default: { root: "px-1 [--slide:12px]", row: "gap-2" },
  sm: { root: "px-0.5 [--slide:11px]", row: "gap-1.5" },
  lg: { root: "px-3 [--slide:13px]", row: "gap-2.5" },
} as const

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Leading icon; turns on the pill shape and the icon-to-arrow hover slide. */
  icon?: React.ReactNode
  /** Set false for backward/dismissive actions (Back, Cancel) to keep the icon without the arrow. */
  arrowOnHover?: boolean
}

function SlideContent({
  icon,
  arrowOnHover,
  rowClassName,
  children,
}: {
  icon: React.ReactNode
  arrowOnHover: boolean
  rowClassName: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "flex translate-x-[var(--slide)] items-center transition-transform duration-500 ease-spring motion-reduce:transition-none",
        rowClassName,
        arrowOnHover &&
          "group-focus-visible/slide:-translate-x-[var(--slide)] [@media(hover:hover)]:group-hover/slide:-translate-x-[var(--slide)]",
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
      {arrowOnHover ? (
        <span
          aria-hidden="true"
          className="flex translate-x-2.5 opacity-0 transition-[opacity,transform] duration-500 ease-spring motion-reduce:transition-none group-focus-visible/slide:translate-x-0 group-focus-visible/slide:opacity-100 [@media(hover:hover)]:group-hover/slide:translate-x-0 [@media(hover:hover)]:group-hover/slide:opacity-100"
        >
          <ArrowRight />
        </span>
      ) : (
        // Keeps the width identical to the arrow variant so toggling arrowOnHover never shifts layout.
        <span aria-hidden="true" className="size-4 shrink-0" />
      )}
    </span>
  )
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, icon, arrowOnHover = true, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    const slideSize = icon !== undefined && size !== "icon" ? SLIDE_SIZE[size ?? "default"] : null

    if (!slideSize) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      )
    }

    const rootClassName = cn(
      buttonVariants({ variant, size }),
      "rounded-full transition-[background-color,transform] duration-150 hover:scale-[1.02] active:scale-[0.96] motion-reduce:transform-none",
      arrowOnHover && "group/slide",
      slideSize.root,
      className,
    )
    const slide = (label: React.ReactNode) => (
      <SlideContent icon={icon} arrowOnHover={arrowOnHover} rowClassName={slideSize.row}>
        {label}
      </SlideContent>
    )

    if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
      return (
        <Slot className={rootClassName} ref={ref} {...props}>
          {React.cloneElement(children, undefined, slide(children.props.children))}
        </Slot>
      )
    }

    return (
      <Comp className={rootClassName} ref={ref} {...props}>
        {slide(children)}
      </Comp>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
