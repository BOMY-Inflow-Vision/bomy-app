// @vitest-environment jsdom
//
// Product card = the Kvist shop card layout (measured 2026-10-25 on demo.codeandchill.store/kvist/shop
// at 1440 px): pastel tile (radius 1.75rem, 4:5), badge pill with blur, text under the tile with the
// price on the right. Charlie's call (2026-10-26): sellers upload normal photos, so the photo covers the
// whole tile (no inset, no oval shadow). On hover (hover devices) the photo lifts, turns and grows
// a little, so the turn never shows an empty corner.
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProductCard, TILE_TONES, type ProductCardProps } from "@/components/product-card"

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
const layer = (d: Document) => tile(d).querySelector("img")!.parentElement!
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
    has(tile(d), ["overflow-hidden", "rounded-bento", "isolate"])
  })

  it("tile: 4:5, relative, no border and no shadow, and no white card around the text", () => {
    const d = render({ categoryName: "Tea", storeName: "Acme", minPriceSen: 100 })
    has(tile(d), ["relative", "aspect-tile"])
    for (const el of [link(d), tile(d), text(d)]) {
      for (const c of Array.from(el.classList)) {
        expect(c, `${c} on ${el.className}`).not.toMatch(/^(border|shadow|hover:shadow|bg-card)/)
      }
    }
  })

  it("the tile colour is one of the six Kvist pastels, stable for a product and varied across products", () => {
    const toneOf = (href: string) =>
      Array.from(tile(render({ href })).classList).filter((c) => c.startsWith("bg-tile-"))
    expect(TILE_TONES).toHaveLength(6)
    expect(render().querySelectorAll("li a")).toHaveLength(1)
    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const t = toneOf(`/products/s/p${i}`)
      expect(t).toHaveLength(1)
      expect(TILE_TONES).toContain(t[0])
      expect(toneOf(`/products/s/p${i}`)).toEqual(t)
      seen.add(t[0]!)
    }
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })

  it("no cover image: Package icon in the picture layer, same tile, no emoji", () => {
    const d = render({ coverImageUrl: null })
    expect(link(d).querySelector("img")).toBeNull()
    expect(tile(d).querySelector("svg")).not.toBeNull()
    expect(d.body.textContent).not.toContain("📦")
    has(tile(d), ["aspect-tile", "rounded-bento"])
  })

  it("name wraps, never forces a width, and keeps its colour on hover", () => {
    const d = render({ name: "x".repeat(80) })
    const name = Array.from(d.querySelectorAll("li p")).find(
      (p) => p.textContent === "x".repeat(80),
    )!
    has(name, ["break-words", "font-medium", "leading-snug", "text-foreground"])
    expect(Array.from(name.classList).some((c) => /group-hover:text/.test(c))).toBe(false)
    expect(
      Array.from(name.classList).some((c) => /^(w-|min-w-(?!0$)|whitespace-nowrap)/.test(c)),
    ).toBe(false)
  })
})

describe("ProductCard picture (photo covers the tile)", () => {
  it("the picture layer fills the whole tile and the photo is cropped to cover, not contained", () => {
    const d = render()
    has(layer(d), ["absolute", "inset-0"])
    has(link(d).querySelector("img"), ["h-full", "w-full", "object-cover"])
    expect(link(d).querySelector("img")!.classList.contains("object-contain")).toBe(false)
  })

  it("no oval shadow under the picture (it would show on the photo)", () => {
    expect(tile(render()).querySelector('[aria-hidden="true"]:not(svg)')).toBeNull()
  })

  it("hover (hover devices, motion allowed) lifts 14 px, turns -2 deg and grows to 110% over 0.7 s ease-out-expo", () => {
    const l = layer(render())
    has(l, [
      "transition-transform",
      "duration-700",
      "ease-out-expo",
      "motion-reduce:transition-none",
    ])
    has(l, [
      "motion-safe:[@media(hover:hover)]:group-hover:-translate-y-3.5",
      "motion-safe:[@media(hover:hover)]:group-hover:-rotate-2",
      "motion-safe:[@media(hover:hover)]:group-hover:scale-110",
    ])
  })

  it("keyboard focus gets the same lift, turn and grow", () => {
    has(layer(render()), [
      "motion-safe:group-focus-visible:-translate-y-3.5",
      "motion-safe:group-focus-visible:-rotate-2",
      "motion-safe:group-focus-visible:scale-110",
    ])
  })

  it("the tile clips the moving photo (overflow-hidden, rounded, isolate)", () => {
    has(tile(render()), ["overflow-hidden", "rounded-bento", "isolate"])
  })

  it("no scaling of the whole photo any more (the old 1.04 zoom is gone)", () => {
    expect(link(render()).outerHTML).not.toContain("scale-[1.04]")
  })
})

describe("ProductCard text (price on the right)", () => {
  const full = { categoryName: "Tea", storeName: "Acme Store", minPriceSen: 1250 }
  const kids = (d: Document) => Array.from(text(d).children)

  it("text sits under the tile on the Kvist grid, with the Kvist padding", () => {
    has(text(render(full)), [
      "grid",
      "grid-cols-[1fr_auto]",
      "items-baseline",
      "gap-x-3",
      "px-1",
      "pt-3",
      "sm:px-1.5",
      "sm:pt-4",
    ])
  })

  it("DOM order is category, name, store, price (the phone order)", () => {
    expect(kids(render(full)).map((k) => k.textContent)).toEqual([
      "Tea",
      "Tea",
      "Acme Store",
      "from RM12.50",
    ])
  })

  it("phone: every line takes the full row; the price is on its own line, right-aligned", () => {
    const [cat, name, store, price] = kids(render(full))
    for (const el of [cat!, name!, store!, price!]) has(el, ["col-span-2"])
    has(price!, ["mt-1", "text-right"])
    has(name!, ["text-card-name-sm", "line-clamp-2"])
    has(cat!, ["text-xs", "text-muted-foreground"])
    has(store!, ["mt-1", "text-xs", "text-muted-foreground"])
  })

  it("from lg: category above, name under it, store third, price on the right across rows 1 and 2", () => {
    const [cat, name, store, price] = kids(render(full))
    has(cat!, ["lg:col-span-1", "lg:row-start-1", "lg:text-card-meta"])
    has(name!, ["lg:col-span-1", "lg:row-start-2", "lg:line-clamp-1", "lg:text-card-name"])
    has(store!, ["lg:col-span-1", "lg:row-start-3", "lg:text-card-meta"])
    has(price!, [
      "lg:col-span-1",
      "lg:col-start-2",
      "lg:row-span-2",
      "lg:row-start-1",
      "lg:self-end",
      "lg:text-xl",
      "lg:mt-0",
    ])
  })

  it("price: display font, semibold, tabular, ink colour; no wrapping from lg, may wrap below", () => {
    const price = kids(render(full))[3]!
    has(price, [
      "font-display",
      "font-semibold",
      "tabular-nums",
      "text-foreground",
      "text-card-name",
      "lg:whitespace-nowrap",
      "[overflow-wrap:anywhere]",
    ])
    expect(price.classList.contains("whitespace-nowrap")).toBe(false)
    expect(price.classList.contains("text-primary-text")).toBe(false)
  })

  it("a very long price can wrap anywhere below lg, so it stays inside a narrow card", () => {
    const d = render({ ...full, minPriceSen: 1299999999 })
    const price = kids(d)[3]!
    expect(price.textContent).toContain("12999999.99")
    has(price, ["[overflow-wrap:anywhere]"])
    expect(price.classList.contains("whitespace-nowrap")).toBe(false)
  })

  it("no price: the name takes the whole row at every size", () => {
    const d = render({ ...full, minPriceSen: null })
    const [, name] = kids(d)
    expect(kids(d)).toHaveLength(3)
    has(name!, ["col-span-2", "lg:col-span-2"])
    expect(name!.classList.contains("lg:col-span-1")).toBe(false)
  })

  it("no category: the name is first in the text block; no store and no price render nothing", () => {
    expect(kids(render({ ...full, categoryName: null }))[0]!.textContent).toBe("Tea")
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
  it("shows only the picture and the name, even if full fields are passed", () => {
    const d = render({
      variant: "compact",
      categoryName: "Tea",
      storeName: "Acme",
      minPriceSen: 100,
    })
    expect(d.body.textContent).toBe("Tea")
    expect(text(d).children).toHaveLength(1)
  })
})

describe("ProductCard badge", () => {
  it.each(["New", "Sold out"] as const)("renders %s once, as the Kvist pill with blur", (badge) => {
    const d = render({ badge })
    const hits = Array.from(d.querySelectorAll("li span")).filter((s) => s.textContent === badge)
    expect(hits).toHaveLength(1)
    has(hits[0]!, [
      "absolute",
      "left-4",
      "top-4",
      "z-10",
      "rounded-full",
      "bg-card/90",
      "px-3",
      "py-1",
      "text-xs",
      "font-medium",
      "backdrop-blur",
    ])
    expect(layer(d).contains(hits[0]!)).toBe(false)
  })
  it("renders none when null or absent", () => {
    for (const badge of [null, undefined]) {
      const d = render(badge === undefined ? {} : { badge })
      expect(d.body.textContent).toBe("Tea")
    }
  })
})
