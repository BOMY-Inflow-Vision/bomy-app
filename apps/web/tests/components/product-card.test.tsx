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
const tile = (d: Document) => link(d).firstElementChild!
const text = (d: Document) => link(d).lastElementChild!
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

  it("link: group, min-w-0, rounded-bento and a visible focus ring; clipping is on the tile only", () => {
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
    has(tile(d), ["overflow-hidden", "rounded-bento"])
  })

  it("Kvist look: the picture tile has no border and no shadow, and no white card around the text", () => {
    const d = render({ categoryName: "Tea", storeName: "Acme", minPriceSen: 100 })
    for (const el of [link(d), tile(d), link(d).lastElementChild!]) {
      for (const c of Array.from(el.classList)) {
        expect(c, `${c} on ${el.className}`).not.toMatch(/^(border|shadow|hover:shadow|bg-card)/)
      }
    }
  })

  it("art area is the blush tile at 4:5 and holds the image", () => {
    const d = render()
    expect(link(d).querySelector("img")!.parentElement!.parentElement).toBe(tile(d))
    has(tile(d), ["bg-tint", "aspect-tile", "relative"])
    expect(link(d).querySelector("img")!.getAttribute("alt")).toBe("Tea")
  })

  it("no cover image: Package icon, same art classes, no emoji", () => {
    const d = render({ coverImageUrl: null })
    expect(link(d).querySelector("img")).toBeNull()
    expect(link(d).querySelector("svg")).not.toBeNull()
    expect(d.body.textContent).not.toContain("📦")
    expect(tile(d).querySelector("svg")).not.toBeNull()
    has(tile(d), ["bg-tint", "aspect-tile"])
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
    expect(
      Array.from(name.classList).some((c) => /^(w-|min-w-(?!0$)|whitespace-nowrap)/.test(c)),
    ).toBe(false)
  })
})

describe("ProductCard full variant", () => {
  const full = {
    categoryName: "Tea",
    storeName: "Acme Store",
    minPriceSen: 1250,
  }
  const para = (d: Document, test: (t: string) => boolean) =>
    Array.from(d.querySelectorAll("li p")).find((p) => test(p.textContent))!

  it("text sits under the tile on a two-column grid: name on the left, price on the right", () => {
    const d = render(full)
    has(text(d), ["grid", "grid-cols-[1fr_auto]", "items-baseline", "gap-x-3", "pt-3"])
    // children: category, name, price, store (category and name share the text "Tea")
    const name = text(d).children[1]!
    const price = para(d, (t) => t.includes("from RM12.50"))
    // same row: name and price are consecutive children, neither spans both columns
    expect(name.nextElementSibling).toBe(price)
    // on a phone each takes the whole row (so the name is not squeezed); from sm they share a row
    for (const el of [name, price]) has(el, ["col-span-2", "sm:col-span-1"])
    has(price, ["text-primary-text", "font-semibold", "whitespace-nowrap"])
    expect(price.classList.contains("text-primary")).toBe(false)
  })

  it("category is a small plain line above, store a line below, both across the full width", () => {
    const d = render(full)
    const kids = Array.from(text(d).children)
    expect(kids.map((k) => k.textContent)).toEqual(["Tea", "Tea", "from RM12.50", "Acme Store"])
    has(kids[0]!, ["col-span-2", "text-xs", "text-muted-foreground", "truncate"])
    expect(kids[0]!.classList.contains("font-mono")).toBe(false)
    has(kids[3]!, ["col-span-2", "text-sm", "text-muted-foreground", "truncate"])
  })

  it("no price: the name takes the whole row", () => {
    const d = render({ ...full, minPriceSen: null })
    // children: category, name, store
    expect(text(d).children).toHaveLength(3)
    has(text(d).children[1]!, ["col-span-2", "line-clamp-2"])
    expect(text(d).children[1]!.classList.contains("sm:col-span-1")).toBe(false)
  })

  it("no category: the name is first in the text block", () => {
    const d = render({ ...full, categoryName: null })
    expect(text(d).firstElementChild!.textContent).toBe("Tea")
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
  })
})

// R6b Task 3: on hover or keyboard focus the photo scales 1.04 inside the clip. Only an inner
// layer scales, so the badge stays put; touch screens get no sticky hover; reduced motion gets none.
describe("ProductCard hover motion", () => {
  const layer = (d: Document) => link(d).querySelector("img")!.parentElement!

  it("the photo sits in its own scaling layer, with the 0.7 s ease-out-expo transition", () => {
    const d = render()
    has(layer(d), ["h-full", "w-full", "transition-transform", "duration-700", "ease-out-expo"])
  })

  it("the layer scales on hover (hover-capable devices only) and on keyboard focus, never with reduced motion", () => {
    const d = render()
    has(layer(d), [
      "motion-safe:[@media(hover:hover)]:group-hover:scale-[1.04]",
      "motion-safe:group-focus-visible:scale-[1.04]",
      "motion-reduce:transition-none",
    ])
  })

  it("the clip is isolated so Safari keeps round corners while the photo scales", () => {
    has(tile(render()), ["isolate", "overflow-hidden", "rounded-bento"])
  })

  it("the badge is outside the scaling layer", () => {
    const d = render({ badge: "New" })
    const badge = Array.from(d.querySelectorAll("li span")).find((s) => s.textContent === "New")!
    expect(layer(d).contains(badge)).toBe(false)
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
