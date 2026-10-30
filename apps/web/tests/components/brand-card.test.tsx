// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BrandCard, type BrandCardProps } from "@/components/brand-card"

function render(props: Partial<BrandCardProps> = {}) {
  const html = renderToStaticMarkup(
    <BrandCard href="/brands/acme" name="Acme" productCount={3} {...props} />,
  )
  return new DOMParser().parseFromString(`<ul><li>${html}</li></ul>`, "text/html")
}
const link = (d: Document) => d.querySelector("li a")!
const has = (el: Element | null, tokens: string[]) => {
  expect(el, tokens.join(" ")).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}
const paragraph = (d: Document, text: string) =>
  Array.from(d.querySelectorAll("li p")).find((p) => p.textContent === text) ?? null

describe("BrandCard structure", () => {
  it("one link wraps the whole card and goes to href", () => {
    const d = render()
    expect(d.querySelectorAll("li a")).toHaveLength(1)
    expect(link(d).getAttribute("href")).toBe("/brands/acme")
  })

  it("link: group, full height, shrinkable, bento radius and a focus ring; the clip is on the tile", () => {
    const d = render()
    has(link(d), [
      "group",
      "block",
      "h-full",
      "min-w-0",
      "rounded-bento",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    ])
    expect(link(d).classList.contains("overflow-hidden")).toBe(false)
    has(link(d).querySelector("[data-tile]"), [
      "relative",
      "isolate",
      "aspect-tile",
      "overflow-hidden",
      "rounded-bento",
    ])
  })

  it("the tile is a pastel like the product card tile, with no border or shadow box around the card", () => {
    const d = render()
    const tile = link(d).querySelector("[data-tile]")!
    const tones = ["sage", "butter", "sky", "sand", "stone", "blush"].map((t) => `bg-tile-${t}`)
    expect(tones.some((c) => tile.classList.contains(c))).toBe(true)
    expect(link(d).querySelector(".shadow-sm")).toBeNull()
  })

  it("keeps its tone: the same brand always gets the same pastel", () => {
    const tone = (d: Document) =>
      Array.from(link(d).querySelector("[data-tile]")!.classList).find((c) =>
        c.startsWith("bg-tile-"),
      )
    expect(tone(render())).toBe(tone(render()))
  })

  it("the letter is decorative, upper-case, and lifts and turns on hover like a product photo", () => {
    const d = render({ name: "acme" })
    const letter = link(d).querySelector('[aria-hidden="true"]')!
    expect(letter.textContent).toBe("A")
    has(letter, [
      "transition-transform",
      "duration-700",
      "ease-out-expo",
      "motion-safe:[@media(hover:hover)]:group-hover:-translate-y-3.5",
      "motion-safe:[@media(hover:hover)]:group-hover:-rotate-2",
      "motion-safe:group-focus-visible:-translate-y-3.5",
      "motion-reduce:transition-none",
    ])
  })

  it("an empty name shows an empty letter and does not throw", () => {
    const d = render({ name: "" })
    expect(link(d).querySelector('[aria-hidden="true"]')!.textContent).toBe("")
  })

  it("name: hover colour on the card, clamps to two lines, breaks anywhere", () => {
    const d = render({ name: "x".repeat(80) })
    const name = paragraph(d, "x".repeat(80))!
    has(name, [
      "font-medium",
      "text-foreground",
      "group-hover:text-primary",
      "line-clamp-2",
      "[overflow-wrap:anywhere]",
    ])
    expect(name.closest(".group")).not.toBeNull()
    expect(Array.from(name.classList).some((c) => /^(w-|min-w-\[|whitespace-nowrap)/.test(c))).toBe(
      false,
    )
  })
})

describe("BrandCard excerpt", () => {
  it("clamps to two lines and breaks anywhere", () => {
    const d = render({ excerpt: "y".repeat(160) })
    has(paragraph(d, "y".repeat(160)), [
      "line-clamp-2",
      "[overflow-wrap:anywhere]",
      "text-muted-foreground",
    ])
  })
  it.each([null, undefined, ""])("is absent for %j", (excerpt) => {
    const d = render({ excerpt })
    expect(d.querySelectorAll("li p")).toHaveLength(2) // name and count only
  })
})

describe("BrandCard categories", () => {
  it("shows all names on one clamped line, and long names break inside it", () => {
    const names = ["Tea", "C".repeat(60)]
    const d = render({ categories: names })
    const line = paragraph(d, `Tea · ${"C".repeat(60)}`)!
    has(line, ["line-clamp-1", "text-muted-foreground", "[overflow-wrap:anywhere]"])
  })
  it("no category line for an empty or missing list", () => {
    for (const categories of [[], undefined]) {
      const d = render(categories === undefined ? {} : { categories })
      expect(d.querySelectorAll("li p")).toHaveLength(2)
    }
  })
})

describe("BrandCard product count", () => {
  it.each([
    [0, "0 products"],
    [1, "1 product"],
    [2, "2 products"],
  ])("%i reads %s", (n, text) => {
    expect(paragraph(render({ productCount: n }), text)).not.toBeNull()
  })
})
