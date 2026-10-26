"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"

// The category filter on /products: ONE <nav> (so every link is in the page once). Below lg it is a
// sideways pill row that sticks under the floating nav bar; from lg it is a column on the left that
// sticks the same way and scrolls by itself when it is taller than the screen. On load the active
// pill is centred by moving the row's own scroll (not scrollIntoView, which can move the whole page).
export function CategoryRail({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const nav = ref.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.clientWidth) / 2
  }, [])

  return (
    <div className="sticky top-nav-clear z-30 -mx-3 bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:py-3 lg:backdrop-blur-none">
      <nav
        ref={ref}
        aria-label={label}
        className="relative flex min-w-0 flex-nowrap gap-1 overflow-x-auto rounded-full bg-muted p-1 lg:max-h-rail lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:rounded-3xl"
      >
        {children}
      </nav>
    </div>
  )
}
