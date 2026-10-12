import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils.js"

const alertVariants = cva("rounded-lg border p-4", {
  variants: {
    variant: {
      success: "border-success/30 bg-success-subtle text-success",
      warning: "border-warning/30 bg-warning-subtle text-warning",
      info: "border-info/30 bg-info-subtle text-info",
      destructive: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: {
    variant: "info",
  },
})

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

// Visual only. It has no role or aria-live: a call site that must be announced passes them.
function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />
}

export { Alert, alertVariants }
