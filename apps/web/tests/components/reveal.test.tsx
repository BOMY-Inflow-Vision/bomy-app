// @vitest-environment jsdom
//
// Scroll reveal (soft-red R6a). jsdom has no layout, so the screen size, the block position and the
// observer are faked; the real feel is proved in the browser.
import React, { act } from "react"
import { renderToString } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Reveal } from "@/components/motion/reveal"
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let fire: ((entry: Partial<IntersectionObserverEntry>) => void) | null = null
let rootMargin = ""
let top = 2000
let reduce = false

class FakeObserver {
  constructor(cb: IntersectionObserverCallback, opts: IntersectionObserverInit) {
    rootMargin = opts.rootMargin ?? ""
    fire = (entry) =>
      cb([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  observe() {}
  disconnect() {}
}

let host: HTMLDivElement
let root: Root

function mount(node: React.ReactNode) {
  act(() => {
    root.render(node)
  })
  return host.querySelector("[data-reveal]") as HTMLElement
}

beforeEach(() => {
  top = 2000
  reduce = false
  fire = null
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }))
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top }) as DOMRect,
  )
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

describe("Reveal", () => {
  it("is visible in server HTML", () => {
    const html = renderToString(<Reveal>hi</Reveal>)
    expect(html).toContain('data-reveal="shown"')
    expect(html).not.toContain("opacity-0")
  })

  it("hides a block below the line, then shows it when the observer fires", () => {
    const el = mount(<Reveal>hi</Reveal>)
    expect(el.getAttribute("data-reveal")).toBe("hidden")
    expect(el.className).toContain("opacity-0")
    expect(rootMargin).toBe("0px 0px -17% 0px")
    act(() => fire!({ isIntersecting: true }))
    expect(el.getAttribute("data-reveal")).toBe("shown")
    expect(el.className).not.toContain("opacity-0")
  })

  it("never hides a block that is already on screen (no blink)", () => {
    top = 100
    const el = mount(<Reveal>hi</Reveal>)
    expect(el.getAttribute("data-reveal")).toBe("shown")
    expect(fire).toBeNull()
  })

  it("never hides a block that is partly on screen (top between the 83 % line and the bottom)", () => {
    top = 800
    const el = mount(<Reveal>hi</Reveal>)
    expect(el.getAttribute("data-reveal")).toBe("shown")
    expect(fire).toBeNull()
  })

  it("hides itself when the section inside renders nothing (keeps no gap)", () => {
    const Empty = () => null
    const el = mount(
      <Reveal>
        <Empty />
      </Reveal>,
    )
    expect(el.matches(":empty")).toBe(true)
    expect(el.className).toContain("empty:hidden")
  })

  it("prints a hidden block in full", () => {
    const el = mount(<Reveal>hi</Reveal>)
    expect(el.className).toContain("print:opacity-100")
    expect(el.className).toContain("print:translate-y-0")
  })

  it("never hides a block when reduced motion is on", () => {
    reduce = true
    const el = mount(<Reveal>hi</Reveal>)
    expect(el.getAttribute("data-reveal")).toBe("shown")
    expect(fire).toBeNull()
  })

  it("shows a hidden block at once when focus enters it", () => {
    const el = mount(
      <Reveal>
        <a href="/x">link</a>
      </Reveal>,
    )
    expect(el.getAttribute("data-reveal")).toBe("hidden")
    act(() => {
      el.querySelector("a")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    })
    expect(el.getAttribute("data-reveal")).toBe("shown")
  })

  it("adds an 80 ms delay for each step", () => {
    const el = mount(<Reveal step={3}>hi</Reveal>)
    expect(el.style.transitionDelay).toBe("240ms")
  })
})
