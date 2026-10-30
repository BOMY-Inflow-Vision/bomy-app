// @vitest-environment jsdom
// R5a: /brands uses the shared heading, a category pill tray and the shared BrandCard.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getBrands, getStoreCategories } = vi.hoisted(() => ({
  getBrands: vi.fn(),
  getStoreCategories: vi.fn(),
}))
vi.mock("@/app/brands/queries", () => ({ getBrands, getStoreCategories }))

import BrandsPage from "@/app/brands/page"

const CATS = [
  { id: "c1", name: "Food", slug: "food" },
  { id: "c2", name: "Craft", slug: "craft" },
]
const BRAND = {
  id: "b1",
  name: "Acme",
  slug: "acme",
  excerpt: "Good things",
  productCount: 2,
  categories: ["Food"],
}

async function render(sp: Record<string, string> = {}, cats = CATS, brands: unknown[] = [BRAND]) {
  getBrands.mockResolvedValue({ brands, total: brands.length, totalPages: 1 })
  getStoreCategories.mockResolvedValue(cats)
  const el = await BrandsPage({ searchParams: Promise.resolve(sp) })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}
const pills = (d: Document) =>
  Array.from(d.querySelectorAll('nav[aria-label="Filter by category"] a'))

beforeEach(() => {
  getBrands.mockReset()
  getStoreCategories.mockReset()
})

describe("/brands heading", () => {
  it("shared heading with the description, and the old mb-6 spacing", async () => {
    const d = await render()
    const h1 = d.querySelector("h1")!
    expect(h1.textContent).toBe("Brands")
    expect(h1.classList.contains("sm:text-4xl")).toBe(true)
    const header = h1.closest("header")!
    expect(header.classList.contains("mb-6")).toBe(true)
    expect(header.querySelector("p")!.textContent).toBe("Discover sellers on BOMY")
  })
})

describe("/brands category pills", () => {
  it("a labelled nav lists All then every category, with no sidebar", async () => {
    const d = await render()
    expect(pills(d).map((a) => a.textContent)).toEqual(["All", "Food", "Craft"])
    expect(d.querySelector("aside")).toBeNull()
  })
  it("no tray at all when there are no store categories", async () => {
    const d = await render({}, [])
    expect(d.querySelector('nav[aria-label="Filter by category"]')).toBeNull()
  })
  it("All is current without a category; the chosen category is the only current pill", async () => {
    const none = await render()
    expect(
      pills(none)
        .filter((a) => a.hasAttribute("aria-current"))
        .map((a) => a.textContent),
    ).toEqual(["All"])
    const some = await render({ category: "c1" })
    expect(
      pills(some)
        .filter((a) => a.hasAttribute("aria-current"))
        .map((a) => a.textContent),
    ).toEqual(["Food"])
  })
  it("an unknown category id leaves no pill current", async () => {
    const d = await render({ category: "nope" })
    expect(pills(d).filter((a) => a.hasAttribute("aria-current"))).toHaveLength(0)
  })
  it("links keep the search term and All drops the category; plain without a term", async () => {
    const withQ = await render({ q: "tea shop", category: "c1" })
    expect(pills(withQ).map((a) => a.getAttribute("href"))).toEqual([
      "/brands?q=tea%20shop",
      "/brands?q=tea%20shop&category=c1",
      "/brands?q=tea%20shop&category=c2",
    ])
    const plain = await render()
    expect(pills(plain).map((a) => a.getAttribute("href"))).toEqual([
      "/brands",
      "/brands?category=c1",
      "/brands?category=c2",
    ])
  })
})

describe("/brands grid", () => {
  it("each brand is a BrandCard link to its page, inside a shrinkable list item", async () => {
    const d = await render()
    const a = d.querySelector('ul li a[href="/brands/acme"]')!
    expect(a.textContent).toContain("Acme")
    expect(a.textContent).toContain("Good things")
    expect(a.textContent).toContain("2 products")
    expect(a.querySelector("[data-tile]")).not.toBeNull()
    expect(a.closest("li")!.classList.contains("min-w-0")).toBe(true)
  })
  it("empty state keeps its words", async () => {
    const d = await render({}, CATS, [])
    expect(d.body.textContent).toContain("No brands found.")
  })
  it("the count line keeps its words", async () => {
    const d = await render({ q: "ac" })
    expect(d.body.textContent).toContain('1 brand for "ac"')
  })
})
