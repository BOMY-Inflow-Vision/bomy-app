// @vitest-environment jsdom
// R4: /products uses the shared ProductCard and a pill tray for categories.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getProducts, getCategories } = vi.hoisted(() => ({
  getProducts: vi.fn(),
  getCategories: vi.fn(),
}))
vi.mock("@/app/products/queries", () => ({
  getProducts,
  getCategories,
  formatMyrSen: (n: number) => `RM${(n / 100).toFixed(2)}`,
}))

import ProductsPage from "@/app/products/page"

const CATS = [
  { id: "c1", name: "Tea", slug: "tea" },
  { id: "c2", name: "Mugs", slug: "mugs" },
]
const PRODUCT = {
  id: "p1",
  name: "Green Tea",
  slug: "green-tea",
  storeName: "Acme",
  storeSlug: "acme",
  storeId: "s1",
  coverImageUrl: null,
  categoryName: "Tea",
  minPriceSen: 1250,
}

async function render(sp: Record<string, string> = {}) {
  getProducts.mockResolvedValue({ products: [PRODUCT], total: 1, page: 1, totalPages: 1 })
  getCategories.mockResolvedValue(CATS)
  const el = await ProductsPage({ searchParams: Promise.resolve(sp) })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}
const pills = (d: Document) =>
  Array.from(d.querySelectorAll('nav[aria-label="Filter by category"] a'))

beforeEach(() => {
  getProducts.mockReset()
  getCategories.mockReset()
})

describe("/products category pills", () => {
  it("a labelled nav lists All then every category, with no sidebar", async () => {
    const d = await render()
    expect(pills(d).map((a) => a.textContent)).toEqual(["All", "Tea", "Mugs"])
    expect(d.querySelector("aside")).toBeNull()
  })

  it("All is the current pill when no category is set", async () => {
    const d = await render()
    const current = pills(d).filter((a) => a.getAttribute("aria-current") === "page")
    expect(current.map((a) => a.textContent)).toEqual(["All"])
  })

  it("the chosen category is the only current pill", async () => {
    const d = await render({ category: "c1" })
    const current = pills(d).filter((a) => a.getAttribute("aria-current") === "page")
    expect(current.map((a) => a.textContent)).toEqual(["Tea"])
  })

  it("an unknown category id leaves no pill current (as before)", async () => {
    const d = await render({ category: "nope" })
    expect(pills(d).filter((a) => a.hasAttribute("aria-current"))).toHaveLength(0)
  })

  it("links keep the search term, and All drops the category", async () => {
    const d = await render({ q: "green tea", category: "c1" })
    const hrefs = pills(d).map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual([
      "/products?q=green%20tea",
      "/products?q=green%20tea&category=c1",
      "/products?q=green%20tea&category=c2",
    ])
  })

  it("without a search term the links are plain", async () => {
    const d = await render()
    expect(pills(d).map((a) => a.getAttribute("href"))).toEqual([
      "/products",
      "/products?category=c1",
      "/products?category=c2",
    ])
  })
})

describe("/products grid", () => {
  it("each result is the shared tile: blush art area, name, store and price", async () => {
    const d = await render()
    const a = d.querySelector('ul li a[href="/products/acme/green-tea"]')!
    expect(a).not.toBeNull()
    expect(a.querySelector(".bg-tint.aspect-tile")).not.toBeNull()
    expect(a.textContent).toContain("Green Tea")
    expect(a.textContent).toContain("Acme")
    expect(a.textContent).toContain("from RM12.50")
  })

  it("empty state keeps its words", async () => {
    getProducts.mockResolvedValue({ products: [], total: 0, page: 1, totalPages: 0 })
    getCategories.mockResolvedValue(CATS)
    const el = await ProductsPage({ searchParams: Promise.resolve({}) })
    expect(renderToStaticMarkup(el)).toContain("No products found.")
  })
})

describe("brand store page", () => {
  it("uses the shared compact ProductCard and has no local copy", () => {
    const src = readFileSync(resolve(__dirname, "../../src/app/brands/[slug]/page.tsx"), "utf8")
    expect(src).toContain('from "@/components/product-card"')
    expect(src).toContain('variant="compact"')
    expect(src).not.toMatch(/function ProductCard/)
    expect(src).not.toContain("📦")
  })
})
