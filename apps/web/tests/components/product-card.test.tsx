// @vitest-environment jsdom
//
// Product card = the Kvist shop card layout (measured 2026-10-25 on demo.codeandchill.store/kvist/shop
// at 1440 px): pastel tile (radius 1.75rem, square), badge pill with blur, text under the tile with the
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
      ratingAvg="0"
      ratingCount={0}
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

  it("tile: square, relative, no border and no shadow, and no white card around the text", () => {
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

describe("ProductCard cut-out picture (seller ticked 'no background')", () => {
  const cut = () => render({ cutout: true })
  const shadow = (d: Document) => tile(d).querySelector('[aria-hidden="true"]:not(svg)')!

  it("the picture sits in a layer inset 11% (bottom 15%) and is contained, not cropped", () => {
    const d = cut()
    has(layer(d), ["absolute", "inset-[11%]", "bottom-[15%]"])
    has(link(d).querySelector("img"), ["size-full", "object-contain"])
    expect(link(d).querySelector("img")!.classList.contains("object-cover")).toBe(false)
  })

  it("soft oval shadow under the picture: decorative, 58% wide, blurred, 55% opaque", () => {
    const s = shadow(cut())
    has(s, [
      "absolute",
      "bottom-[13%]",
      "left-1/2",
      "h-6",
      "w-[58%]",
      "-translate-x-1/2",
      "rounded-[50%]",
      "bg-ink/25",
      "blur-md",
      "opacity-[0.55]",
    ])
    expect(s.textContent).toBe("")
  })

  it("hover lifts 14 px and turns -2 deg (no growing), and the shadow thins to 32% and narrows to 78%", () => {
    const d = cut()
    has(layer(d), [
      "motion-safe:[@media(hover:hover)]:group-hover:-translate-y-3.5",
      "motion-safe:[@media(hover:hover)]:group-hover:-rotate-2",
      "motion-safe:group-focus-visible:-translate-y-3.5",
      "motion-safe:group-focus-visible:-rotate-2",
    ])
    expect(layer(d).className).not.toMatch(/scale-/)
    has(shadow(d), [
      "transition-[opacity,transform]",
      "duration-700",
      "ease-out-expo",
      "motion-reduce:transition-none",
      "motion-safe:[@media(hover:hover)]:group-hover:opacity-[0.32]",
      "motion-safe:[@media(hover:hover)]:group-hover:scale-x-[0.78]",
      "motion-safe:group-focus-visible:opacity-[0.32]",
      "motion-safe:group-focus-visible:scale-x-[0.78]",
    ])
  })

  it("a normal photo (no flag, or false) has no shadow and no inset", () => {
    for (const props of [{}, { cutout: false }]) {
      const d = render(props)
      expect(tile(d).querySelector('[aria-hidden="true"]:not(svg)')).toBeNull()
      expect(layer(d).classList.contains("inset-0")).toBe(true)
    }
  })
})

describe("ProductCard text (store and category, name, rating and price)", () => {
  const full = { categoryName: "Tea", storeName: "Acme Store", minPriceSen: 1250 }
  // Three rows, the same on phone and desktop: [store | category], name, [rating | price].
  const top = (d: Document) => text(d).children[0]!
  const name = (d: Document) => text(d).children[1]!
  const bottom = (d: Document) => text(d).children[2]!
  const price = (d: Document) => bottom(d).querySelector("p")!

  it("text sits under the tile with the Kvist padding", () => {
    has(text(render(full)), ["px-1", "pt-3", "sm:px-1.5", "sm:pt-4"])
  })

  it("row order is store and category, name, rating and price", () => {
    const d = render(full)
    expect(text(d).children).toHaveLength(3)
    expect(Array.from(top(d).children).map((k) => k.textContent)).toEqual(["Acme Store", "Tea"])
    expect(name(d).textContent).toBe("Tea")
    expect(bottom(d).textContent).toBe("\u2605 0 (0)from RM12.50")
  })

  it("row 1: store on the left, category on the far right, capped so the store keeps room", () => {
    const [store, cat] = Array.from(top(render(full)).children)
    has(top(render(full)), ["flex", "justify-between", "text-xs", "text-muted-foreground"])
    has(store!, ["min-w-0", "truncate"])
    has(cat!, ["ml-auto", "max-w-[50%]", "shrink-0", "truncate"])
  })

  it("row 2: the name keeps its phone and desktop sizes and clamps", () => {
    has(name(render(full)), [
      "text-card-name-sm",
      "line-clamp-2",
      "lg:line-clamp-1",
      "lg:text-card-name",
    ])
  })

  it("row 3: rating left, price right, on one line", () => {
    const b = bottom(render(full))
    has(b, ["flex", "justify-between", "items-baseline"])
    expect(b.firstElementChild!.textContent).toBe("\u2605 0 (0)")
    expect(b.lastElementChild!.textContent).toBe("from RM12.50")
  })

  it("price: display font, semibold, tabular, ink colour, right-aligned, wraps anywhere", () => {
    has(price(render(full)), [
      "text-right",
      "font-display",
      "font-semibold",
      "tabular-nums",
      "text-foreground",
      "text-card-name",
      "[overflow-wrap:anywhere]",
    ])
    expect(price(render(full)).classList.contains("text-primary-text")).toBe(false)
  })

  it("a very long price stays inside a narrow card", () => {
    const d = render({ ...full, minPriceSen: 1299999999 })
    expect(price(d).textContent).toContain("12999999.99")
    has(price(d), ["[overflow-wrap:anywhere]"])
    expect(price(d).classList.contains("whitespace-nowrap")).toBe(false)
  })

  it("no price: row 3 holds only the rating", () => {
    const d = render({ ...full, minPriceSen: null })
    expect(bottom(d).textContent).toBe("\u2605 0 (0)")
    expect(d.body.textContent).not.toContain("from RM")
  })

  it("no category: row 1 holds only the store; no store and no category: no row 1 at all", () => {
    const d = render({ ...full, categoryName: null })
    expect(top(d).textContent).toBe("Acme Store")
    const d2 = render({ storeName: null, categoryName: null, minPriceSen: null })
    expect(text(d2).children).toHaveLength(2)
    expect(d2.body.textContent).toBe("Tea\u2605 0 (0)")
    const empty = Array.from(d.querySelectorAll("li p")).filter((p) => p.textContent.trim() === "")
    expect(empty).toHaveLength(0)
  })

  it("category without a store still sits on the right", () => {
    const d = render({ categoryName: "Tea", storeName: null })
    expect(top(d).children).toHaveLength(1)
    has(top(d).firstElementChild, ["ml-auto"])
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
    expect(d.body.textContent).toBe("Tea\u2605 0 (0)")
    expect(text(d).children).toHaveLength(2) // the name and the rating row
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
      expect(d.body.textContent).toBe("Tea\u2605 0 (0)")
    }
  })
})

describe("ProductCard rating", () => {
  it("an unrated product shows a muted \u2605 0 (0)", () => {
    const d = render({ ratingAvg: "0", ratingCount: 0, storeName: "Acme" })
    expect(text(d).textContent).toContain("\u2605 0 (0)")
  })

  it("a rated product shows the average and the count", () => {
    const d = render({ ratingAvg: "4.60", ratingCount: 23, storeName: "Acme" })
    expect(text(d).textContent).toContain("\u2605 4.6 (23)")
  })

  it("full: the rating is on the bottom row, before the price", () => {
    const d = render({ storeName: "Acme", minPriceSen: 100, ratingAvg: "4.60", ratingCount: 23 })
    const texts = Array.from(text(d).children).map((k) => k.textContent)
    expect(texts).toEqual(["Acme", "Tea", "\u2605 4.6 (23)from RM1.00"])
  })

  it("the compact variant shows the rating row too, after the name", () => {
    const d = render({ variant: "compact", ratingAvg: "4.60", ratingCount: 23 })
    const t = text(d).textContent
    expect(t).toContain("\u2605 4.6 (23)")
    expect(t.indexOf("Tea")).toBeLessThan(t.indexOf("\u2605"))
  })
})
