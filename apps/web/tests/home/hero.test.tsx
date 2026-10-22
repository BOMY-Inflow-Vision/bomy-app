// @vitest-environment jsdom
// R3 Task 3: the hero bento follows the visibility rules in tests/home/visibility.ts, takes every word
// from the copy object, and carries only real data. Fit of long text inside a tile is proved by the
// browser measurements (jsdom has no layout), not here.
import type React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Hero } from "@/app/_home/hero"
import type { HomeData } from "@/app/_home/home-types"

import { sentinelCopy, visibleTextOutside } from "./sentinel-copy"
import { EMPTY, VISIBILITY_CASES } from "./visibility"

const HERO_MARKERS = [
  "hero-headline",
  "hero-featured",
  "hero-featured-price",
  "hero-themed",
  "hero-delivery",
] as const

function mountEl(el: React.ReactElement): HTMLElement {
  const div = document.createElement("div")
  div.innerHTML = renderToStaticMarkup(el)
  return div
}
function mount(data: HomeData) {
  return mountEl(<Hero data={data} copy={sentinelCopy().hero} />)
}
const marker = (root: Element, m: string) => root.querySelector(`[data-home="${m}"]`)

describe.each(VISIBILITY_CASES)("Hero: $name", ({ data, present }) => {
  it("shows exactly the hero markers the rules allow", () => {
    const root = mount(data)
    for (const m of HERO_MARKERS) {
      expect(marker(root, m) !== null, m).toBe((present as string[]).includes(m))
    }
  })

  it("has no hard-coded words and no empty price element", () => {
    const root = mount(data)
    const real = data.featured ? [data.featured.name, data.featured.storeName] : []
    expect(visibleTextOutside(root, real)).toEqual([])
    expect(root.textContent).not.toMatch(/RM0(\.00)?\b/)
    if (!(present as string[]).includes("hero-featured-price")) {
      expect(root.textContent).not.toMatch(/RM\d/)
    }
  })
})

describe("Hero details", () => {
  const full = VISIBILITY_CASES[1]!.data

  it("featured card links to the product page with real name and store", () => {
    const root = mount(full)
    const card = marker(root, "hero-featured")!
    const link = card.closest("a") ?? card.querySelector("a")
    expect(link?.getAttribute("href")).toBe("/products/feature-store/featured-product")
    expect(card.textContent).toContain("Featured Product")
    expect(card.textContent).toContain("Feature Store")
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://img.test/f1.jpg")
    expect(marker(root, "hero-featured-price")?.textContent).toContain("RM45.90")
  })

  it("the headline card has the heading and two links", () => {
    const root = mount(full)
    expect(root.querySelectorAll("h1")).toHaveLength(1)
    const hrefs = [...marker(root, "hero-headline")!.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toEqual(["/products", "/brands"])
  })

  it("decorative shapes are aria-hidden", () => {
    const root = mount(full)
    const decor = [...root.querySelectorAll("[data-decor]")]
    expect(decor.length).toBeGreaterThan(0)
    for (const d of decor) expect(d.getAttribute("aria-hidden")).toBe("true")
    for (const svg of root.querySelectorAll("svg")) {
      expect(svg.closest("[aria-hidden='true']"), "every svg is decorative").not.toBeNull()
    }
  })

  it("long copy: text tiles wrap and shrink, and none has a fixed height", () => {
    const long = sentinelCopy().hero
    const stretched = JSON.parse(
      JSON.stringify(long).replace(/«([^»]+)»/g, "«$1$1$1»"),
    ) as typeof long
    const container = mountEl(<Hero data={full} copy={stretched} />)
    for (const m of ["hero-headline", "hero-themed", "hero-delivery"]) {
      const el = marker(container, m)!
      expect(el.className, m).toMatch(/min-w-0/)
      expect(el.className, m).not.toMatch(/(^|\s)h-\d|(^|\s)h-\[/)
    }
    expect(container.querySelector("h1")!.className).toMatch(/\[overflow-wrap:anywhere\]/)
  })

  it("the empty page still has the heading, buttons and delivery tile", () => {
    const root = mount(EMPTY)
    expect(root.querySelector("h1")).not.toBeNull()
    expect(marker(root, "hero-delivery")).not.toBeNull()
  })
})
