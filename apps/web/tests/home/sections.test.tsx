// @vitest-environment jsdom
// R3 Task 6: promise, stats, sellers and CTA follow the visibility table, carry only real data and
// copy-object words, and add no price, testimonial or form. Geometry, focus order and contrast are
// proved in the browser (Task 8).
import type React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Cta } from "@/app/_home/cta"
import { PromiseSection as PromiseCards } from "@/app/_home/promise"
import { Sellers } from "@/app/_home/sellers"
import { Stats } from "@/app/_home/stats"

import { sentinelCopy, visibleTextOutside } from "./sentinel-copy"
import { OVERFULL, VISIBILITY_CASES } from "./visibility"

function mountEl(el: React.ReactElement): HTMLElement {
  const div = document.createElement("div")
  div.innerHTML = renderToStaticMarkup(el)
  return div
}
const q = (root: Element, m: string) => root.querySelector(`[data-home="${m}"]`)
const copy = sentinelCopy()
const has = (present: string[], m: string) => present.includes(m)

describe.each(VISIBILITY_CASES)("sections: $name", ({ data, present }) => {
  it("promise and CTA always render", () => {
    expect(q(mountEl(<PromiseCards copy={copy.promise} />), "promise")).not.toBeNull()
    expect(q(mountEl(<Cta copy={copy.cta} />), "cta")).not.toBeNull()
  })

  it("stats follow the real counts", () => {
    const root = mountEl(<Stats counts={data.counts} copy={copy.stats} />)
    expect(q(root, "stats") !== null).toBe(has(present, "stats"))
    for (const k of ["brands", "products", "categories"] as const) {
      expect(q(root, `stat-${k}`) !== null, k).toBe(has(present, `stat-${k}`))
      expect(q(root, `stat-${k}`) !== null, k).toBe(data.counts[k] > 0)
    }
    expect(visibleTextOutside(root, [])).toEqual([])
  })

  it("sellers follow the brands", () => {
    const root = mountEl(<Sellers brands={data.brands} copy={copy.sellers} />)
    expect(q(root, "sellers") !== null).toBe(has(present, "sellers"))
    const names = data.brands.flatMap((b) => [b.name, b.excerpt ?? ""]).filter(Boolean)
    expect(visibleTextOutside(root, [...names, "product", "products"])).toEqual([])
  })

  it("no hard-coded words in promise or CTA", () => {
    expect(visibleTextOutside(mountEl(<PromiseCards copy={copy.promise} />), [])).toEqual([])
    expect(visibleTextOutside(mountEl(<Cta copy={copy.cta} />), [])).toEqual([])
  })
})

describe("Promise", () => {
  const root = mountEl(<PromiseCards copy={copy.promise} />)
  it("statement in the dark text colour, chip links to /membership, no price", () => {
    const s = root.querySelector("[data-promise-statement]")!
    expect(s.textContent).toBe("«promise.statement»")
    expect(s.className).toMatch(/text-foreground/)
    expect(s.className).not.toMatch(/text-muted/)
    expect(root.querySelector("a[href='/membership']")!.textContent).toBe("«promise.chip»")
    expect(root.textContent).not.toMatch(/RM\d|\$\d/)
  })
})

describe("Stats", () => {
  it("shows the real numbers", () => {
    const root = mountEl(
      <Stats counts={{ brands: 3, products: 9, categories: 12 }} copy={copy.stats} />,
    )
    expect(q(root, "stat-brands")!.textContent).toContain("3")
    expect(q(root, "stat-products")!.textContent).toContain("9")
    expect(q(root, "stat-categories")!.textContent).toContain("12")
    expect(q(root, "stat-brands")!.textContent).toContain("«stats.labels.brands(3)»")
  })
  it("a count of 1 reads as singular and every label gets its own number", () => {
    const root = mountEl(
      <Stats counts={{ brands: 1, products: 1, categories: 2 }} copy={copy.stats} />,
    )
    expect(q(root, "stat-brands")!.textContent).toContain("«stats.labels.brands(1)»")
    expect(q(root, "stat-products")!.textContent).toContain("«stats.labels.products(1)»")
    expect(q(root, "stat-categories")!.textContent).toContain("«stats.labels.categories(2)»")
  })
  it("renders nothing when every count is zero", () => {
    const root = mountEl(
      <Stats counts={{ brands: 0, products: 0, categories: 0 }} copy={copy.stats} />,
    )
    expect(root.innerHTML).toBe("")
  })
})

describe("Sellers", () => {
  it("shows at most three brand cards, linked to the brand page, with the all-brands link", () => {
    const root = mountEl(<Sellers brands={OVERFULL.brands} copy={copy.sellers} />)
    const links = [...q(root, "sellers")!.querySelectorAll("a[href^='/brands/']")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/brands/brand-0",
      "/brands/brand-1",
      "/brands/brand-2",
    ])
    expect(q(root, "sellers")!.querySelector("a[href='/brands']")!.textContent).toBe(
      "«sellers.all»",
    )
  })
  it("a brand with no product is not shown; with none left the section is absent", () => {
    const b = { id: "b", name: "Empty", slug: "empty", excerpt: null, productCount: 0 }
    expect(mountEl(<Sellers brands={[b]} copy={copy.sellers} />).innerHTML).toBe("")
  })
})

describe("CTA", () => {
  it("has exactly the two real links and no form or input", () => {
    const root = mountEl(<Cta copy={copy.cta} />)
    const hrefs = [...q(root, "cta")!.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual(["/seller/apply", "/membership"])
    expect(root.querySelector("form,input,textarea,button")).toBeNull()
    expect(root.textContent).not.toMatch(/RM\d|\$\d|newsletter|subscribe/i)
  })
})
