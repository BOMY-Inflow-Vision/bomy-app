import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// The admin's buttons, after TillyTop: a pill, 44px tall, 14px semibold words, no hover growth and
// no sliding arrow. It takes the same props as the storefront's Button (@bomy/ui) so a page only
// changes its import; the storefront keeps its own look. A `link` button stays a plain text link
// (it sits inside table rows and sentences, where a 44px pill would be too big).
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,color,box-shadow,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-90",
        outline:
          "ring-1 ring-inset ring-foreground/20 hover:bg-foreground hover:text-background hover:ring-foreground",
        secondary: "bg-card text-card-foreground shadow-tile hover:bg-muted",
        reward: "bg-reward text-reward-foreground hover:brightness-90",
        success: "bg-success text-success-foreground hover:brightness-90",
        warning: "bg-warning text-warning-foreground hover:brightness-90",
        ghost: "hover:bg-foreground/[.06]",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-11 px-4",
        lg: "h-12 px-6",
        icon: "size-9 p-0",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-1 py-1" }],
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Leading icon. */
  icon?: React.ReactNode
  /** Accepted so pages written for the storefront Button keep compiling; the admin has no arrow slide. */
  arrowOnHover?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      icon,
      arrowOnHover: _arrowOnHover,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size, className }))
    if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
      return (
        <Slot className={classes} ref={ref} {...props}>
          {React.cloneElement(
            children,
            undefined,
            <>
              {icon}
              {children.props.children}
            </>,
          )}
        </Slot>
      )
    }
    const Comp = asChild ? Slot : "button"
    return (
      <Comp className={classes} ref={ref} {...props}>
        {icon}
        {children}
      </Comp>
    )
  },
)
Button.displayName = "Button"
