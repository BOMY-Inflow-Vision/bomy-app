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
  it("one link wraps the whole tile and goes to href", () => {
    const d = render()
    expect(d.querySelectorAll("li a")).toHaveLength(1)
    expect(link(d).getAttribute("href")).toBe("/brands/acme")
  })

  it("link: group, full height, shrinkable, bento radius and a focus ring; clip is on the inner wrapper", () => {
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
    has(link(d).firstElementChild, [
      "h-full",
      "overflow-hidden",
      "rounded-bento",
      "border",
      "border-border",
      "bg-card",
      "shadow-sm",
      "hover:shadow-md",
    ])
  })

  it("avatar is a decorative blush tile with the upper-cased first letter", () => {
    const d = render({ name: "acme" })
    const avatar = link(d).querySelector('[aria-hidden="true"]')!
    expect(avatar.textContent).toBe("A")
    has(avatar, ["rounded-full", "bg-tint", "text-primary-text", "shrink-0"])
  })

  it("an empty name shows an empty avatar and does not throw", () => {
    const d = render({ name: "" })
    expect(link(d).querySelector('[aria-hidden="true"]')!.textContent).toBe("")
  })

  it("name: hover colour on the tile, breaks anywhere", () => {
    const d = render({ name: "x".repeat(80) })
    const name = paragraph(d, "x".repeat(80))!
    has(name, [
      "font-semibold",
      "text-foreground",
      "group-hover:text-primary",
      "[overflow-wrap:anywhere]",
    ])
    expect(name.closest(".group")).not.toBeNull()
    expect(Array.from(name.classList).some((c) => /^(w-|min-w-\[|whitespace-nowrap)/.test(c))).toBe(
      false,
    )
  })
})

describe("BrandCard excerpt", () => {
  it("clamps to three lines and breaks anywhere", () => {
    const d = render({ excerpt: "y".repeat(160) })
    has(paragraph(d, "y".repeat(160)), [
      "line-clamp-3",
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
  it("one badge each inside a wrapping container, long names break inside their own box", () => {
    const names = ["Tea", "C".repeat(60)]
    const d = render({ categories: names })
    const badges = Array.from(link(d).querySelectorAll("span")).filter((s) =>
      names.includes(s.textContent ?? ""),
    )
    expect(badges).toHaveLength(2)
    for (const b of badges) has(b, ["max-w-full", "whitespace-normal", "[overflow-wrap:anywhere]"])
    has(badges[0]!.parentElement, ["flex", "min-w-0", "flex-wrap"])
  })
  it("no container for an empty or missing list", () => {
    for (const categories of [[], undefined]) {
      const d = render(categories === undefined ? {} : { categories })
      expect(link(d).querySelector(".flex-wrap")).toBeNull()
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
