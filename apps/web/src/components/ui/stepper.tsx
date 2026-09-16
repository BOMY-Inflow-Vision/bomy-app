import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export interface StepItem {
  label: string
  description?: string
}

// Read-only progress indicator for a journey that spans multiple pages (checkout,
// membership, brand subscription) — each page renders its own step as `currentStep`,
// so there's no client-side step transition to animate between.
export function Stepper({
  steps,
  currentStep,
  className,
  "aria-label": ariaLabel = "Progress",
}: {
  steps: StepItem[]
  currentStep: number
  className?: string
  "aria-label"?: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex w-full items-center", className)}>
      {steps.map((step, index) => {
        const isActive = index === currentStep
        const isCompleted = index < currentStep
        const isLast = index === steps.length - 1

        return (
          <div key={step.label} className={cn("flex items-center", !isLast && "flex-1")}>
            <span
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "relative flex size-9 shrink-0 animate-select-item-in items-center justify-center rounded-full border-2 text-sm font-medium motion-reduce:animate-none",
                isActive || isCompleted
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30 bg-background text-muted-foreground",
              )}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              {isActive && (
                <span
                  key={currentStep}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full border-2 border-primary animate-step-pulse motion-reduce:hidden"
                />
              )}
              <span
                key={isCompleted ? "check" : "number"}
                className="flex animate-copy-pop items-center justify-center motion-reduce:animate-none"
              >
                {isCompleted ? <Check className="size-4" aria-hidden="true" /> : index + 1}
              </span>
              <span className="sr-only">
                {`: ${step.label}${isCompleted ? ", completed" : isActive ? ", current step" : ""}`}
              </span>
            </span>

            <div className="ml-2 hidden sm:block">
              <p
                className={cn(
                  "text-xs font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
              {step.description && (
                <p className="text-[11px] text-muted-foreground">{step.description}</p>
              )}
            </div>

            {!isLast && (
              <div
                aria-hidden="true"
                className="mx-2 h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-[width] duration-500 ease-spring",
                    isCompleted ? "w-full" : "w-0",
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
