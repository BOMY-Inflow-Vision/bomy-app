"use client"

import * as React from "react"
import { Check, Copy, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ButtonCopyProps {
  value: string
  className?: string
  disabled?: boolean
  /** ms the "Copied" state stays visible before reverting to idle. */
  duration?: number
  /** ms the loading spinner shows before flipping to the success state. */
  loadingDuration?: number
  /**
   * "sm" is for placement right next to small inline text (e.g. a truncated ID): a smaller
   * icon and no visible border/background at rest, so it reads as a quiet inline control
   * rather than a chip. The box still holds at 24px (WCAG 2.2 minimum pointer target).
   */
  size?: "sm" | "default"
  onCopied?: () => void
  onError?: () => void
}

type CopyState = "idle" | "loading" | "success"

const ARIA_LABELS: Record<CopyState, string> = {
  idle: "Copy",
  loading: "Copying…",
  success: "Copied",
}

const SIZE = {
  default: { box: "size-7", icon: 14, chrome: "border border-input bg-background" },
  sm: { box: "size-6", icon: 12, chrome: "" },
} as const

export function ButtonCopy({
  value,
  className,
  disabled = false,
  duration = 1500,
  loadingDuration = 300,
  size = "default",
  onCopied,
  onError,
}: ButtonCopyProps) {
  const [state, setState] = React.useState<CopyState>("idle")
  const { box, icon: iconSize, chrome } = SIZE[size]

  // loading -> success -> idle is entirely time-driven; each effect arms the next leg
  // and only the currently-relevant one is mounted, so an early unmount cleans up cleanly.
  React.useEffect(() => {
    if (state !== "loading") return
    const timer = setTimeout(() => setState("success"), loadingDuration)
    return () => clearTimeout(timer)
  }, [state, loadingDuration])

  React.useEffect(() => {
    if (state !== "success") return
    const timer = setTimeout(() => setState("idle"), duration)
    return () => clearTimeout(timer)
  }, [state, duration])

  const handleClick = React.useCallback(() => {
    setState("loading")
    navigator.clipboard.writeText(value).then(
      () => onCopied?.(),
      () => {
        setState("idle")
        onError?.()
      },
    )
  }, [value, onCopied, onError])

  const icons: Record<CopyState, React.ReactNode> = {
    idle: <Copy size={iconSize} />,
    loading: <LoaderCircle size={iconSize} className="animate-spin" />,
    success: <Check size={iconSize} />,
  }

  return (
    <button
      type="button"
      aria-label={ARIA_LABELS[state]}
      aria-live="polite"
      disabled={state !== "idle" || disabled}
      onClick={handleClick}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default",
        box,
        chrome,
        state === "success" &&
          (chrome ? "border-emerald-600/40 text-emerald-600" : "text-emerald-600"),
        className,
      )}
    >
      <span
        key={state}
        className="flex animate-copy-pop items-center justify-center motion-reduce:animate-none"
      >
        {icons[state]}
      </span>
    </button>
  )
}
