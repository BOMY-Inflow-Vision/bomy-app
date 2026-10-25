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
  createdAt: new Date("2020-01-01T00:00:00Z"),
  activeVariantCount: 1,
  inStockVariantCount: 1,
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
  it("a labelled nav lists All then every category, once", async () => {
    const d = await render()
    expect(pills(d).map((a) => a.textContent)).toEqual(["All", "Tea", "Mugs"])
    expect(d.querySelectorAll('nav[aria-label="Filter by category"]')).toHaveLength(1)
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

describe("/products heading", () => {
  it("uses the shared heading and still reads Products", async () => {
    const d = await render()
    const h1 = d.querySelector("h1")!
    expect(h1.textContent).toBe("Products")
    expect(h1.classList.contains("sm:text-4xl")).toBe(true)
  })

  // Kvist shop look: one rounded box holds the product count, the big title and the search.
  it("the count, the title and the search form share one rounded white box", async () => {
    const d = await render()
    const box = d.querySelector("h1")!.closest(".rounded-bento")!
    expect(box).not.toBeNull()
    for (const c of ["bg-card", "min-w-0"]) expect(box.classList.contains(c)).toBe(true)
    expect(box.querySelector("form")).not.toBeNull()
    expect(box.querySelector("input[name=q]")).not.toBeNull()
    expect(box.textContent).toMatch(/\d+ products?/)
    // the box comes before the category pills
    const pillsNav = d.querySelector('nav[aria-label="Filter by category"]')!
    expect(box.compareDocumentPosition(pillsNav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it("the grid is 2 columns on a phone and 3 from a small screen up, never 4", async () => {
    const d = await render()
    const grid = d.querySelector('section[aria-label="Product results"] ul')!
    for (const c of ["grid", "grid-cols-2", "sm:grid-cols-3", "gap-x-4", "gap-y-8"]) {
      expect(grid.classList.contains(c), `${c} on ${grid.className}`).toBe(true)
    }
    expect(Array.from(grid.classList).some((c) => /grid-cols-4$/.test(c))).toBe(false)
  })

  // Kvist-like shop with a sticky category column on the left (from lg) and a sticky pill row on a phone.
  it("lg layout: the category rail on the left, the products on the right", async () => {
    const d = await render()
    const nav = d.querySelector('nav[aria-label="Filter by category"]')!
    const results = d.querySelector('section[aria-label="Product results"]')!
    const layout = nav.closest(".lg\\:grid")!
    expect(layout).not.toBeNull()
    for (const c of ["lg:grid", "lg:grid-cols-rail", "lg:gap-8"]) {
      expect(layout.classList.contains(c), `${c} on ${layout.className}`).toBe(true)
    }
    expect(layout.contains(results)).toBe(true)
    // the rail comes first in the document, so it is the left column and first for keyboard users
    expect(nav.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("the product grid is 2 columns from lg (the rail takes room) and 3 from xl", async () => {
    const grid = (await render()).querySelector('section[aria-label="Product results"] ul')!
    for (const c of ["grid-cols-2", "sm:grid-cols-3", "lg:grid-cols-2", "xl:grid-cols-3"]) {
      expect(grid.classList.contains(c), `${c} on ${grid.className}`).toBe(true)
    }
  })

  it("shows Sold out for a product with no stock, New for a recent one, none otherwise", async () => {
    getProducts.mockResolvedValue({
      products: [
        { ...PRODUCT, id: "p1", slug: "a", name: "Old Stocked" },
        { ...PRODUCT, id: "p2", slug: "b", name: "Gone", inStockVariantCount: 0 },
        { ...PRODUCT, id: "p3", slug: "c", name: "Fresh", createdAt: new Date() },
        {
          ...PRODUCT,
          id: "p4",
          slug: "d",
          name: "Nothing",
          activeVariantCount: 0,
          inStockVariantCount: 0,
          minPriceSen: null,
        },
      ],
      total: 4,
      page: 1,
      totalPages: 1,
    })
    getCategories.mockResolvedValue(CATS)
    const el = await ProductsPage({ searchParams: Promise.resolve({}) })
    const d = new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
    const badgeOf = (slug: string) =>
      d.querySelector(`ul li a[href="/products/acme/${slug}"] span.absolute`)?.textContent ?? null
    expect(badgeOf("a")).toBeNull()
    expect(badgeOf("b")).toBe("Sold out")
    expect(badgeOf("c")).toBe("New")
    expect(badgeOf("d")).toBeNull()
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
