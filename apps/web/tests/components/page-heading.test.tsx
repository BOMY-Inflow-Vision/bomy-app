// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PageHeading } from "@/components/page-heading"

function render(props: Parameters<typeof PageHeading>[0]) {
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(<PageHeading {...props} />),
    "text/html",
  )
  return doc.body
}
const has = (el: Element | null, tokens: string[]) => {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("PageHeading", () => {
  it("renders one h1 with the shared scale and wrap rule", () => {
    const b = render({ title: "Brands" })
    expect(b.querySelectorAll("h1")).toHaveLength(1)
    const h1 = b.querySelector("h1")!
    expect(h1.textContent).toBe("Brands")
    has(h1, [
      "min-w-0",
      "text-3xl",
      "font-bold",
      "tracking-tight",
      "text-foreground",
      "sm:text-4xl",
      "[overflow-wrap:anywhere]",
    ])
  })

  it("is a header that may shrink", () => {
    has(render({ title: "x" }).querySelector("header"), ["min-w-0"])
  })

  it.each([null, undefined, ""])("renders no description element for %j", (description) => {
    expect(render({ title: "x", description }).querySelector("p")).toBeNull()
  })

  it("renders the description under the title and lets it wrap", () => {
    const p = render({ title: "x", description: "Discover sellers" }).querySelector("p")!
    expect(p.textContent).toBe("Discover sellers")
    has(p, ["mt-2", "text-base", "text-muted-foreground", "[overflow-wrap:anywhere]"])
  })

  it("align center centres the header; the default does not", () => {
    has(render({ title: "x", align: "center" }).querySelector("header"), ["text-center"])
    expect(render({ title: "x" }).querySelector("header")!.classList.contains("text-center")).toBe(
      false,
    )
  })

  it("className merges after the base", () => {
    has(render({ title: "x", className: "mb-6" }).querySelector("header"), ["mb-6", "min-w-0"])
  })

  it("an 80-character unbroken title adds no width or nowrap class", () => {
    const h1 = render({ title: "x".repeat(80) }).querySelector("h1")!
    expect(Array.from(h1.classList).some((c) => /^(w-|min-w-\[|whitespace-nowrap)/.test(c))).toBe(
      false,
    )
  })
})
