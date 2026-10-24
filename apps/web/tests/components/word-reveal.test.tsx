// @vitest-environment jsdom
//
// Word reveal (soft-red R6b). jsdom has no layout, so the screen size, the block box and the page
// height are faked; the real feel is proved in the browser.
import React, { act } from "react"
import { renderToString } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WordReveal, revealProgress, wordOpacity } from "@/components/motion/word-reveal"
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TEXT = "Every shop here is one we would visit"
let host: HTMLDivElement
let root: Root
let box = { top: 2000, bottom: 2100 }
let reduce = false
let scrollY = 0
let pageHeight = 5000
let frames: FrameRequestCallback[] = []
let addListener: ReturnType<typeof vi.spyOn>

function mount() {
  act(() => {
    root.render(<WordReveal text={TEXT} />)
  })
}
const words = () => [...host.querySelectorAll<HTMLElement>("[data-word]")]
const scrollTo = (top: number) => {
  box = { top, bottom: top + 100 }
  act(() => {
    window.dispatchEvent(new Event("scroll"))
    frames.splice(0).forEach((cb) => cb(0))
  })
}

beforeEach(() => {
  box = { top: 2000, bottom: 2100 }
  reduce = false
  scrollY = 0
  pageHeight = 5000
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }))
  frames = []
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true })
  Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true })
  Object.defineProperty(document.documentElement, "scrollHeight", {
    get: () => pageHeight,
    configurable: true,
  })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top: box.top, bottom: box.bottom, height: box.bottom - box.top }) as DOMRect,
  )
  addListener = vi.spyOn(window, "addEventListener")
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const scrollListeners = () => addListener.mock.calls.filter((c) => c[0] === "scroll")

describe("WordReveal math", () => {
  it("progress is 0 at the 85 % line and 1 when the bottom reaches the 55 % line", () => {
    expect(revealProgress({ top: 765, bottom: 865, vh: 900, atPageBottom: false })).toBe(0)
    expect(revealProgress({ top: 395, bottom: 495, vh: 900, atPageBottom: false })).toBe(1)
    expect(revealProgress({ top: 2000, bottom: 2100, vh: 900, atPageBottom: false })).toBe(0)
    expect(revealProgress({ top: -500, bottom: -400, vh: 900, atPageBottom: false })).toBe(1)
  })

  it("progress is 1 at the bottom of the page, so a short page never leaves words faded", () => {
    expect(revealProgress({ top: 800, bottom: 900, vh: 900, atPageBottom: true })).toBe(1)
  })

  it("words fill in order from 0.18 to 1", () => {
    expect(wordOpacity(0, 0, 4)).toBeCloseTo(0.18)
    expect(wordOpacity(0.5, 0, 4)).toBe(1)
    expect(wordOpacity(0.5, 3, 4)).toBeCloseTo(0.18)
    expect(wordOpacity(1, 3, 4)).toBe(1)
  })
})

describe("WordReveal", () => {
  it("server HTML has the sentence once for screen readers and no faded words", () => {
    const html = renderToString(<WordReveal text={TEXT} />)
    expect(html.match(/sr-only/g)).toHaveLength(1)
    expect(html).toContain(`<span class="sr-only">${TEXT}</span>`)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain("opacity:")
  })

  it("fades words after mount when the block starts below the screen, then fills them in", () => {
    mount()
    expect(words().map((w) => w.style.opacity)).toEqual(Array(8).fill("0.18"))
    scrollTo(500) // top 500, bottom 600: inside the range
    const o = words().map((w) => Number(w.style.opacity))
    expect(o[0]).toBe(1)
    expect(o[7]).toBeLessThan(1)
    scrollTo(-600)
    expect(words().map((w) => w.style.opacity)).toEqual(Array(8).fill("1"))
  })

  it("adds no scroll listener and never fades a block already on screen at load (no blink)", () => {
    box = { top: 630, bottom: 730 }
    mount()
    expect(scrollListeners()).toHaveLength(0)
    scrollTo(700)
    expect(words().every((w) => w.style.opacity === "")).toBe(true)
  })

  it("adds no scroll listener and shows every word with reduced motion", () => {
    reduce = true
    mount()
    expect(scrollListeners()).toHaveLength(0)
    expect(words().every((w) => w.style.opacity === "")).toBe(true)
  })

  it("shows every word once the page is scrolled to its bottom", () => {
    mount()
    scrollY = 4100
    scrollTo(850)
    expect(words().map((w) => w.style.opacity)).toEqual(Array(8).fill("1"))
  })
})
