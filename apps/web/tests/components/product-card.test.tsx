// @vitest-environment jsdom
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProductCard, type ProductCardProps } from "@/components/product-card"

function render(props: Partial<ProductCardProps> = {}) {
  const html = renderToStaticMarkup(
    <ProductCard
      href="/products/acme/tea"
      name="Tea"
      coverImageUrl="https://x.test/t.jpg"
      {...props}
    />,
  )
  return new DOMParser().parseFromString(`<ul><li>${html}</li></ul>`, "text/html")
}
const link = (d: Document) => d.querySelector("li a")!
const has = (el: Element | null, tokens: string[]) => {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("ProductCard structure", () => {
  it("one link wraps the whole tile and goes to href", () => {
    const d = render()
    expect(d.querySelectorAll("li a")).toHaveLength(1)
    expect(link(d).getAttribute("href")).toBe("/products/acme/tea")
  })

  it("link: group, min-w-0, rounded-bento and a visible focus ring; clipping is on the inner wrapper only", () => {
    const d = render()
    has(link(d), [
      "group",
      "block",
      "min-w-0",
      "rounded-bento",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    ])
    expect(link(d).classList.contains("overflow-hidden")).toBe(false)
    has(link(d).firstElementChild, ["overflow-hidden", "rounded-bento"])
  })

  it("border and shadow stay on the first child, inside the link (existing store-products test)", () => {
    const d = render()
    has(link(d).firstElementChild, [
      "border",
      "border-border",
      "shadow-sm",
      "hover:shadow-md",
      "bg-card",
    ])
  })

  it("art area is the blush tile at 4:5 and holds the image", () => {
    const d = render()
    const art = link(d).querySelector("img")!.parentElement!
    has(art, ["bg-tint", "aspect-tile"])
    expect(link(d).querySelector("img")!.getAttribute("alt")).toBe("Tea")
  })

  it("no cover image: Package icon, same art classes, no emoji", () => {
    const d = render({ coverImageUrl: null })
    expect(link(d).querySelector("img")).toBeNull()
    expect(link(d).querySelector("svg")).not.toBeNull()
    expect(d.body.textContent).not.toContain("📦")
    has(link(d).querySelector("svg")!.parentElement!.parentElement, ["bg-tint", "aspect-tile"])
  })

  it("name: hover colour on the tile, wraps, clamps to two lines", () => {
    const d = render()
    const name = Array.from(d.querySelectorAll("li p")).find((p) => p.textContent === "Tea")!
    has(name, ["group-hover:text-primary", "break-words", "line-clamp-2", "font-medium"])
    expect(name.closest(".group")).not.toBeNull()
  })

  it("an 80-character unbroken name adds no width or whitespace-nowrap class", () => {
    const d = render({ name: "x".repeat(80) })
    const name = Array.from(d.querySelectorAll("li p")).find(
      (p) => p.textContent === "x".repeat(80),
    )!
    expect(Array.from(name.classList).some((c) => /^(w-|min-w-|whitespace-nowrap)/.test(c))).toBe(
      false,
    )
  })
})

describe("ProductCard full variant", () => {
  const full = {
    categoryName: "Tea",
    storeName: "Acme Store",
    minPriceSen: 1250,
  }
  it("shows the category eyebrow, store and price", () => {
    const d = render(full)
    const eyebrow = Array.from(d.querySelectorAll("li p")).find(
      (p) => p.textContent === "Tea" && p.classList.contains("font-mono"),
    )!
    has(eyebrow, ["font-mono", "text-xs", "uppercase", "tracking-eyebrow", "mb-1"])
    expect(d.body.textContent).toContain("Acme Store")
    const price = Array.from(d.querySelectorAll("li p")).find((p) =>
      p.textContent.includes("from RM12.50"),
    )!
    has(price, ["text-primary-text", "font-semibold"])
    expect(price.classList.contains("text-primary")).toBe(false)
  })

  it("no category: no eyebrow, and the name is first in the body with no top margin", () => {
    const d = render({ ...full, categoryName: null })
    expect(d.querySelector("li p.font-mono")).toBeNull()
    const body = link(d).querySelector("div > div:last-child")!
    const first = body.firstElementChild!
    expect(first.textContent).toBe("Tea")
    expect(Array.from(first.classList).some((c) => /^m[ty]?-/.test(c))).toBe(false)
  })

  it("no store and no price render nothing", () => {
    const d = render({ categoryName: "Tea", storeName: null, minPriceSen: null })
    expect(d.body.textContent).not.toContain("from RM")
    const empty = Array.from(d.querySelectorAll("li p")).filter((p) => p.textContent.trim() === "")
    expect(empty).toHaveLength(0)
  })

  it("a price of 0 is still a price", () => {
    expect(render({ ...full, minPriceSen: 0 }).body.textContent).toContain("from RM0.00")
  })
})

describe("ProductCard compact variant", () => {
  it("shows only the image and the name, even if full fields are passed", () => {
    const d = render({
      variant: "compact",
      categoryName: "Tea",
      storeName: "Acme",
      minPriceSen: 100,
    })
    expect(d.body.textContent).toBe("Tea")
    expect(d.querySelector("li p.font-mono")).toBeNull()
  })
})

describe("ProductCard badge", () => {
  it.each(["New", "Sold out"] as const)("renders %s exactly once", (badge) => {
    const d = render({ badge })
    const hits = Array.from(d.querySelectorAll("li span")).filter((s) => s.textContent === badge)
    expect(hits).toHaveLength(1)
    has(hits[0]!, ["absolute", "rounded-full", "bg-card", "text-xs"])
  })
  it("renders none when null or absent", () => {
    for (const badge of [null, undefined]) {
      const d = render(badge === undefined ? {} : { badge })
      expect(d.body.textContent).toBe("Tea")
    }
  })
})
