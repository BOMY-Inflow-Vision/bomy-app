// @vitest-environment jsdom
// R3 Task 5: category pills plus the newest-products grid, real data only. Long-label and tile fit
// are proved in the browser (Task 8), not here.
import type React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Favourites } from "@/app/_home/favourites"

import { sentinelCopy, visibleTextOutside } from "./sentinel-copy"
import { OVERFULL, VISIBILITY_CASES, product } from "./visibility"

const NOW = new Date("2026-10-02T00:00:00Z")

function mountEl(el: React.ReactElement): HTMLElement {
  const div = document.createElement("div")
  div.innerHTML = renderToStaticMarkup(el)
  return div
}
const q = (root: Element, m: string) => root.querySelector(`[data-home="${m}"]`)
const copy = sentinelCopy().favourites
const mount = (
  products: Parameters<typeof Favourites>[0]["products"],
  categories = VISIBILITY_CASES[1]!.data.categories,
) => mountEl(<Favourites products={products} categories={categories} copy={copy} now={NOW} />)

describe.each(VISIBILITY_CASES)("Favourites: $name", ({ data, present }) => {
  it("shows the grid and the pills exactly as the rules allow", () => {
    const root = mount(data.favourites, data.categories)
    expect(q(root, "favourites-grid") !== null).toBe(
      (present as string[]).includes("favourites-grid"),
    )
    expect(q(root, "pills") !== null).toBe((present as string[]).includes("pills"))
  })

  it("uses no hard-coded words", () => {
    const root = mount(data.favourites, data.categories)
    const real = [
      ...data.categories.map((c) => c.name),
      ...data.favourites.flatMap((p) => [p.name, p.storeName, p.categoryName ?? ""]),
      "New",
      "Sold out",
    ]
    expect(visibleTextOutside(root, real.filter(Boolean))).toEqual([])
  })
})

describe("Favourites details", () => {
  const cats = VISIBILITY_CASES[1]!.data.categories

  it("pins the pill URLs: All, then each category, plain links, none current", () => {
    const root = mount([product(1)], cats)
    const links = [...q(root, "pills")!.querySelectorAll("a")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/products",
      "/products?category=c1",
      "/products?category=c2",
      "/products?category=c3",
    ])
    expect(links[0]!.textContent).toBe("«favourites.all»")
    expect(links.every((a) => !a.hasAttribute("aria-current"))).toBe(true)
    expect(q(root, "pills")!.getAttribute("aria-label")).toBe("«favourites.pillsLabel»")
  })

  it("encodes the category id in the pill URL", () => {
    const root = mount([product(1)], [{ id: "a b&c", name: "Odd", activeProductCount: 1 }])
    expect(q(root, "pills")!.querySelectorAll("a")[1]!.getAttribute("href")).toBe(
      "/products?category=a%20b%26c",
    )
  })

  it("no pill for a category without a product; no tray when none qualifies", () => {
    const root = mount([product(1)], [{ id: "z", name: "Zero", activeProductCount: 0 }])
    expect(q(root, "pills")).toBeNull()
    expect(q(root, "favourites-grid")).not.toBeNull()
  })

  it("one product: exactly one card, a single list item, linked to its page", () => {
    const root = mount([product(1)], cats)
    const items = q(root, "favourites-grid")!.querySelectorAll(":scope > li")
    expect(items).toHaveLength(1)
    expect(items[0]!.querySelector("a")!.getAttribute("href")).toBe("/products/store-1/product-1")
  })

  it("no products: no heading, no grid, no pills, no 'all' link, nothing at all", () => {
    const root = mount([], cats)
    expect(root.innerHTML).toBe("")
  })

  it("shows at most eight cards", () => {
    const root = mount(OVERFULL.favourites, OVERFULL.categories)
    expect(q(root, "favourites-grid")!.querySelectorAll(":scope > li")).toHaveLength(8)
  })

  it("badges come from the data: New for a recent product, Sold out when nothing is in stock", () => {
    const root = mount(
      [
        product(1, { createdAt: new Date("2026-10-01T00:00:00Z") }),
        product(2, {
          createdAt: new Date("2025-01-01T00:00:00Z"),
          activeVariantCount: 1,
          inStockVariantCount: 0,
        }),
        product(3, { createdAt: new Date("2025-01-01T00:00:00Z") }),
      ],
      cats,
    )
    const cards = [...q(root, "favourites-grid")!.querySelectorAll(":scope > li")]
    expect(cards[0]!.textContent).toContain("New")
    expect(cards[1]!.textContent).toContain("Sold out")
    expect(cards[2]!.textContent).not.toMatch(/New|Sold out/)
  })

  it("pills may break a long label, and the tray wraps", () => {
    const root = mount([product(1)], [{ id: "w", name: "W".repeat(80), activeProductCount: 1 }])
    const pill = q(root, "pills")!.querySelectorAll("a")[1]!
    expect(pill.className).toMatch(/\[overflow-wrap:anywhere\]/)
    expect(q(root, "pills")!.className).toMatch(/flex-wrap/)
  })
})
