"use client"

import Lenis from "lenis"
import { useEffect } from "react"

const OWN_SCROLL =
  '[data-lenis-prevent], [role="dialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], textarea'

/**
 * Radix locks page scroll while a Select or menu is open and marks the body. Lenis scrolls the
 * window with script, which ignores that lock, so it must stand down until the lock is gone. This
 * runs for every wheel and touch event, including ones aimed at the page itself (the locked body
 * ignores the pointer, so the event target is the root and `prevent` would never be asked).
 */
export function isPageScrollFree(): boolean {
  return !document.body.hasAttribute("data-scroll-locked")
}

/**
 * Lenis walks the path of every wheel and touch event and asks this about each node. A node keeps
 * its own scroll when it is a dialog, list or menu (Radix draws these), a textarea, something that
 * opted out with `data-lenis-prevent`, or a vertical scroller that has more to scroll. A horizontal
 * strip (`overflow-x: auto` only) does not count, so a vertical wheel over a wide table still
 * scrolls the page.
 */
export function shouldPrevent(node: HTMLElement): boolean {
  if (node.matches(OWN_SCROLL)) return true
  const { overflowY } = getComputedStyle(node)
  return (overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight
}

/**
 * Smooth wheel scroll (Lenis, MIT). Off for people who prefer reduced motion: then there is no
 * Lenis at all and scrolling is the browser's own. It does nothing on route changes: Next's own
 * navigation scroll (top on a new page, restore on Back and Forward, none with `scroll={false}`)
 * stays in charge, and `stopInertiaOnNavigate` only stops a glide that is still running.
 */
export function SmoothScroll() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    let instance: Lenis | null = null

    const sync = () => {
      if (query.matches) {
        instance?.destroy()
        instance = null
      } else if (!instance) {
        instance = new Lenis({
          lerp: 0.1,
          wheelMultiplier: 1,
          syncTouch: false,
          stopInertiaOnNavigate: true,
          prevent: shouldPrevent,
          virtualScroll: isPageScrollFree,
          autoRaf: true,
        })
        // Lenis ends a glide when the rounded animated value equals the rounded target. A target of
        // exactly x.5 is approached from below and never reached, so Lenis would stay in its
        // "smooth" state for seconds and pull native jumps (Tab focus, PageDown) back. Seen on a 2x
        // display: Tab to a link (page at x.5), one wheel notch, then Shift+Tab did not scroll.
        // Snap such a glide to the whole pixel once it is within 0.6 px.
        instance.on("scroll", (lenis) => {
          const { isScrolling, targetScroll, animatedScroll } = lenis
          if (isScrolling !== "smooth") return
          const whole = Math.round(targetScroll)
          if (whole === targetScroll || Math.abs(targetScroll - animatedScroll) >= 0.6) return
          lenis.scrollTo(whole, { immediate: true, force: true })
        })
      }
    }

    sync()
    query.addEventListener("change", sync)
    return () => {
      query.removeEventListener("change", sync)
      instance?.destroy()
      instance = null
    }
  }, [])

  return null
}
