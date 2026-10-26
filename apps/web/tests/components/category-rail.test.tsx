// @vitest-environment jsdom
//
// Category rail on /products: ONE <nav> that is a sticky left column from lg and a sticky sideways
// pill row below lg. jsdom has no layout, so sizes are faked; the real feel is proved in Chrome.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { CategoryRail } from "@/components/category-rail"
import { FilterPill, RAIL_PILL } from "@/components/filter-pill"
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const items = (activeIndex: number | null) => (
  <CategoryRail label="Filter by category">
    {["All", "Tea", "Mugs", "Books"].map((n, i) => (
      <FilterPill key={n} asChild active={activeIndex === i} className={RAIL_PILL}>
        <a href={`/products?c=${n}`}>{n}</a>
      </FilterPill>
    ))}
  </CategoryRail>
)
const has = (el: Element | null, tokens: string[]) => {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("CategoryRail markup", () => {
  const doc = () => new DOMParser().parseFromString(renderToStaticMarkup(items(0)), "text/html")

  it("is one labelled nav holding every link once (no second list for the other screen size)", () => {
    const d = doc()
    expect(d.querySelectorAll("nav")).toHaveLength(1)
    expect(d.querySelector("nav")!.getAttribute("aria-label")).toBe("Filter by category")
    expect(d.querySelectorAll("a")).toHaveLength(4)
  })

  it("the wrapper sticks right under the floating nav, on phone and on desktop", () => {
    const wrap = doc().querySelector("nav")!.parentElement
    has(wrap, ["sticky", "top-nav-clear", "z-30", "lg:self-start"])
  })

  it("below lg the nav is one sideways row; from lg it is a column that scrolls by itself", () => {
    const nav = doc().querySelector("nav")!
    has(nav, [
      "flex",
      "flex-nowrap",
      "overflow-x-auto",
      "lg:flex-col",
      "lg:overflow-x-visible",
      "lg:overflow-y-auto",
      "lg:max-h-rail",
    ])
  })

  it("every pill keeps its size in the row and fills the column (44 px touch target kept)", () => {
    const a = doc().querySelector("a")!
    has(a, ["shrink-0", "whitespace-nowrap", "min-h-11", "lg:w-full", "lg:whitespace-normal"])
  })

  it("only the active pill is current", () => {
    const cur = Array.from(doc().querySelectorAll("a[aria-current=page]"))
    expect(cur.map((a) => a.textContent)).toEqual(["All"])
  })
})

// A value exported from a "use client" file reaches a SERVER page as a reference, not as its text, so
// the pill classes would silently vanish (found in Chrome: pills squashed to one letter wide).
describe("RAIL_PILL reaches the server page as plain text", () => {
  const src = (f: string) => readFileSync(resolve(__dirname, "../../src/components", f), "utf8")
  it("lives in filter-pill.tsx, which is not a client file", () => {
    expect(src("filter-pill.tsx")).not.toMatch(/^["']use client["']/m)
    expect(src("filter-pill.tsx")).toMatch(/export const RAIL_PILL/)
  })
  it("category-rail.tsx is a client file and exports only the component", () => {
    expect(src("category-rail.tsx")).toMatch(/^"use client"/)
    expect(src("category-rail.tsx")).not.toMatch(/export const /)
  })
})

describe("CategoryRail scroll to the active pill", () => {
  let host: HTMLDivElement
  let root: Root
  let intoView: ReturnType<typeof vi.fn>
  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    intoView = vi.fn()
    Element.prototype.scrollIntoView = intoView as unknown as Element["scrollIntoView"]
    // a 300 px wide row inside a 900 px wide strip; the active pill sits at x=600, 100 px wide
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.tagName === "NAV" ? 300 : 100
      },
    })
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.tagName === "NAV" ? 900 : 100
      },
    })
    Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("aria-current") === "page" ? 600 : 0
      },
    })
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    for (const k of ["clientWidth", "scrollWidth", "offsetLeft"]) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k]
    }
  })

  it("centres the active pill by moving the row's own scroll, never the page (no scrollIntoView)", () => {
    act(() => root.render(items(2)))
    const nav = host.querySelector("nav")!
    expect(nav.scrollLeft).toBe(600 - (300 - 100) / 2) // 500
    expect(intoView).not.toHaveBeenCalled()
  })

  it("does nothing when nothing is active or the row does not overflow", () => {
    act(() => root.render(items(null)))
    expect(host.querySelector("nav")!.scrollLeft).toBe(0)
  })
})
