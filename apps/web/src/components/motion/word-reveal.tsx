"use client"

import { useEffect, useRef } from "react"

const START_LINE = 0.85 // progress 0 when the block top is 85 % down the screen
const END_LINE = 0.55 // progress 1 when the block bottom reaches 55 % down the screen
const FADED = 0.18 // a word that has not filled in yet

/** How far the block has scrolled through its range, 0 to 1. A page scrolled to its bottom is 1. */
export function revealProgress(o: {
  top: number
  bottom: number
  vh: number
  atPageBottom: boolean
}): number {
  if (o.atPageBottom) return 1
  const height = o.bottom - o.top
  const total = (START_LINE - END_LINE) * o.vh + height
  return Math.min(1, Math.max(0, (START_LINE * o.vh - o.top) / total))
}

/** Words fill in one after the other: word `index` of `count` is full once progress passes it. */
export function wordOpacity(progress: number, index: number, count: number): number {
  const own = Math.min(1, Math.max(0, progress * count - index))
  return own === 1 ? 1 : FADED + (1 - FADED) * own
}

/**
 * The words of a statement fill in from faint to full as the block scrolls up the screen. The
 * server HTML is the plain sentence, fully visible. Nothing is faded unless script runs, motion is
 * allowed, and the block starts below the bottom of the screen; a block already on screen at load
 * gets no scroll listener at all, so it never blinks. Screen readers read the sentence once (the
 * word spans are hidden from them), so they do not stop on every word.
 */
export function WordReveal({ text }: { text: string }) {
  const wrap = useRef<HTMLSpanElement>(null)
  const words = text.split(" ")

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) return
    const spans = [...el.querySelectorAll<HTMLElement>("[data-word]")]
    let frame = 0
    const paint = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const progress = revealProgress({
        top: r.top,
        bottom: r.bottom,
        vh,
        atPageBottom: window.scrollY + vh >= document.documentElement.scrollHeight - 2,
      })
      spans.forEach((s, i) => {
        s.style.opacity = String(wordOpacity(progress, i, spans.length))
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    paint()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) cancelAnimationFrame(frame)
      spans.forEach((s) => {
        s.style.opacity = ""
      })
    }
  }, [])

  return (
    <>
      <span className="sr-only">{text}</span>
      <span ref={wrap} aria-hidden="true">
        {words.map((w, i) => (
          <span
            key={i}
            data-word
            className="transition-opacity duration-150 ease-linear motion-reduce:transition-none"
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </>
  )
}
