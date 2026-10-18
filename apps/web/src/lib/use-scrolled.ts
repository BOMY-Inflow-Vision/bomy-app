"use client"

import { useEffect, useState } from "react"

/**
 * True once the page has scrolled more than `threshold` px. The floating nav reads it to go from a
 * translucent to a nearly solid background. Starts from the real scroll position, so a reload or
 * Back that restores a scrolled page does not flash the top-of-page look.
 */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [threshold])

  return scrolled
}
