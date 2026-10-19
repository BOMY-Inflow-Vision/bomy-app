// @vitest-environment jsdom
//
// Smooth scroll (soft-red R2, A2). Lenis is an open-source scroll library; it is mocked here, so
// these tests pin how we configure it, when it runs, and which elements keep their own scroll.
// The real feel (wheel curve, navigation, nested scrollers, reduced motion) is proved in the
// browser (plan Task A2 Step 4 and Step 4b), not here.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type ScrollListener = (l: {
  isScrolling: false | "smooth" | "native"
  targetScroll: number
  animatedScroll: number
  scrollTo: (target: number, options: object) => void
}) => void
const lenis = vi.hoisted(() => ({
  ctor: vi.fn(),
  destroy: vi.fn(),
  onScroll: null as unknown as ScrollListener | null,
}))
vi.mock("lenis", () => ({
  default: class {
    constructor(options: unknown) {
      lenis.ctor(options)
    }
    on(event: string, cb: ScrollListener) {
      if (event === "scroll") lenis.onScroll = cb
      return () => {
        lenis.onScroll = null
      }
    }
    destroy() {
      lenis.destroy()
    }
  },
}))

import { SmoothScroll, isPageScrollFree, shouldPrevent } from "@/components/smooth-scroll"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const WEB = resolve(__dirname, "../..")

type Listener = (e: { matches: boolean }) => void
let reduce: { matches: boolean; listeners: Listener[] }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  lenis.ctor.mockClear()
  lenis.destroy.mockClear()
  lenis.onScroll = null
  reduce = { matches: false, listeners: [] }
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("prefers-reduced-motion") ? reduce.matches : false
      },
      addEventListener: (_: string, l: Listener) => reduce.listeners.push(l),
      removeEventListener: (_: string, l: Listener) => {
        reduce.listeners = reduce.listeners.filter((x) => x !== l)
      },
    })),
  )
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const mount = () => act(() => root.render(<SmoothScroll />))
const setReduce = (matches: boolean) =>
  act(() => {
    reduce.matches = matches
    for (const l of reduce.listeners) l({ matches })
  })

describe("shouldPrevent (Lenis walks the event path and asks about each node)", () => {
  const el = (html: string) => {
    const d = document.createElement("div")
    d.innerHTML = html
    return d.firstElementChild as HTMLElement
  }
  it.each([
    ["<div data-lenis-prevent></div>"],
    ['<div role="dialog"></div>'],
    ['<div role="listbox"></div>'],
    ['<div role="menu"></div>'],
    ["<div data-radix-popper-content-wrapper></div>"],
    ["<textarea></textarea>"],
  ])("keeps its own scroll: %s", (html) => {
    expect(shouldPrevent(el(html))).toBe(true)
  })

  it("is false for a plain element", () => {
    expect(shouldPrevent(el("<div></div>"))).toBe(false)
  })

  const scrollable = (overflowY: string, overflowX: string, scrollH: number, clientH: number) => {
    const node = el("<div></div>")
    node.style.overflowY = overflowY
    node.style.overflowX = overflowX
    Object.defineProperty(node, "scrollHeight", { value: scrollH })
    Object.defineProperty(node, "clientHeight", { value: clientH })
    return node
  }
  it("is true for a vertical scroller that has something to scroll", () => {
    expect(shouldPrevent(scrollable("auto", "hidden", 500, 200))).toBe(true)
    expect(shouldPrevent(scrollable("scroll", "visible", 500, 200))).toBe(true)
  })
  it("is false for a vertical scroller with nothing to scroll", () => {
    expect(shouldPrevent(scrollable("auto", "hidden", 200, 200))).toBe(false)
  })
  it("is false for a horizontal-only strip, so a vertical wheel over a table scrolls the page", () => {
    expect(shouldPrevent(scrollable("visible", "auto", 500, 200))).toBe(false)
  })
})

describe("Radix scroll lock", () => {
  // Radix (react-remove-scroll) sets data-scroll-locked on the body while a Select or menu is open.
  // Found in the browser: Lenis moved the page 800 px behind an open Select, because the locked
  // body ignores the pointer and the wheel event then targets <html>, so `prevent` is never asked.
  it("isPageScrollFree is true normally and false while the body is locked", () => {
    expect(isPageScrollFree()).toBe(true)
    document.body.setAttribute("data-scroll-locked", "1")
    try {
      expect(isPageScrollFree()).toBe(false)
    } finally {
      document.body.removeAttribute("data-scroll-locked")
    }
    expect(isPageScrollFree()).toBe(true)
  })
  it("Lenis is given it as virtualScroll, which runs for every wheel and touch event", () => {
    mount()
    const options = lenis.ctor.mock.calls[0]![0] as Record<string, unknown>
    expect(options["virtualScroll"]).toBe(isPageScrollFree)
    act(() => root.unmount())
    root = createRoot(container)
  })
})

describe("<SmoothScroll />", () => {
  it("starts Lenis with the planned options", () => {
    mount()
    expect(lenis.ctor).toHaveBeenCalledTimes(1)
    const options = lenis.ctor.mock.calls[0]![0] as Record<string, unknown>
    expect(options).toMatchObject({
      lerp: 0.1,
      wheelMultiplier: 1,
      stopInertiaOnNavigate: true,
      syncTouch: false,
      autoRaf: true,
      prevent: shouldPrevent,
    })
    expect(options["anchors"]).toBeFalsy()
  })

  it("does not start Lenis when the user prefers reduced motion", () => {
    reduce.matches = true
    mount()
    expect(lenis.ctor).not.toHaveBeenCalled()
  })

  it("follows the preference: starts when it turns off, stops when it turns on", () => {
    reduce.matches = true
    mount()
    expect(lenis.ctor).not.toHaveBeenCalled()
    setReduce(false)
    expect(lenis.ctor).toHaveBeenCalledTimes(1)
    setReduce(true)
    expect(lenis.destroy).toHaveBeenCalledTimes(1)
    setReduce(false)
    expect(lenis.ctor).toHaveBeenCalledTimes(2)
  })

  it("destroys Lenis and removes its listener on unmount", () => {
    mount()
    act(() => root.unmount())
    expect(lenis.destroy).toHaveBeenCalledTimes(1)
    expect(reduce.listeners).toHaveLength(0)
    root = createRoot(container)
  })

  it("renders nothing", () => {
    mount()
    expect(container.innerHTML).toBe("")
  })
})

// Lenis ends a glide when the rounded animated value equals the rounded target. A target that is
// exactly half a pixel (for example 4687.5 + 400 on a 2x display after a Tab focus scroll) is
// approached from below and never reached, so Lenis stays "smooth" for seconds and pulls native
// jumps (focus, PageDown) back. Found in the browser on a 2x display; see the R2 evidence.
describe("half-pixel glide that never finishes", () => {
  const glide = (isScrolling: false | "smooth" | "native", target: number, animated: number) => {
    const scrollTo = vi.fn()
    lenis.onScroll!({ isScrolling, targetScroll: target, animatedScroll: animated, scrollTo })
    return scrollTo
  }
  beforeEach(() => mount())

  it("snaps a smooth glide that is within 0.6 px of a half-pixel target to the whole pixel", () => {
    const scrollTo = glide("smooth", 5087.5, 5087.453)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith(5088, { immediate: true, force: true })
  })
  it("does nothing while the glide is still travelling", () => {
    expect(glide("smooth", 5087.5, 4900)).not.toHaveBeenCalled()
  })
  it("does nothing when Lenis is not smooth-scrolling", () => {
    expect(glide(false, 5087.5, 5087.453)).not.toHaveBeenCalled()
    expect(glide("native", 5087.5, 5087.453)).not.toHaveBeenCalled()
  })
  it("does nothing for a whole-pixel target (Lenis finishes those itself)", () => {
    expect(glide("smooth", 5088, 5087.7)).not.toHaveBeenCalled()
  })
})

describe("source rules", () => {
  const source = readFileSync(resolve(WEB, "src/components/smooth-scroll.tsx"), "utf8")
  it("has no route-change scrolling (Next owns navigation scroll; Bob 1)", () => {
    expect(source).not.toMatch(/usePathname|scrollTo\(\s*0|popstate/)
  })
  it("the root layout mounts it and loads the CSS that ships with the pinned package", () => {
    const layout = readFileSync(resolve(WEB, "src/app/layout.tsx"), "utf8")
    expect(layout).toContain("<SmoothScroll />")
    expect(layout).toContain('import "lenis/dist/lenis.css"')
  })
  it("the shipped Lenis CSS has .lenis rules (no specific property values are assumed)", () => {
    const css = readFileSync(resolve(WEB, "node_modules/lenis/dist/lenis.css"), "utf8")
    expect(css).toMatch(/\.lenis\b/)
  })
  it("lenis is pinned to an exact version", () => {
    const pkg = JSON.parse(readFileSync(resolve(WEB, "package.json"), "utf8")) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies["lenis"]).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
