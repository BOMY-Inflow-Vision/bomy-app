"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A block shows when its top edge reaches this share of the screen height (83 % down). */
const TRIGGER_LINE = 0.83
const STAGGER_MS = 80

type Phase = "shown" | "hidden"

/**
 * Fade and rise on scroll. The server HTML is always visible: the hidden start state is set only
 * after script runs, only when motion is allowed, and only for a block that starts below the
 * bottom of the screen. A block already on screen (or already scrolled past) is never hidden, so there is
 * no blink. Focus inside a hidden block shows it at once. Put this inside an `li`, never around one.
 */
export function Reveal({
  children,
  className,
  step = 0,
}: {
  children: ReactNode
  className?: string
  /** Position in a row; each step adds an 80 ms delay. */
  step?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>("shown")

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // Hide only a block that starts fully below the screen. One partly on screen stays shown, or
    // it would fade out right after load. The 83 % line decides when a hidden block shows.
    if (el.getBoundingClientRect().top < window.innerHeight) return
    setPhase("hidden")
    // Only the top edge counts, so a block taller than the screen still shows.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting || e.boundingClientRect.top < 0)) {
          setPhase("shown")
          observer.disconnect()
        }
      },
      { rootMargin: `0px 0px -${Math.round((1 - TRIGGER_LINE) * 100)}% 0px`, threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      data-reveal={phase}
      onFocusCapture={() => setPhase("shown")}
      style={step > 0 ? { transitionDelay: `${step * STAGGER_MS}ms` } : undefined}
      className={cn(
        // empty:hidden: a section that renders nothing must not keep its gap in `space-y-*`.
        "transition-[opacity,transform] duration-reveal ease-out-expo empty:hidden motion-reduce:transition-none",
        phase === "hidden" && "translate-y-7 opacity-0 print:translate-y-0 print:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  )
}
