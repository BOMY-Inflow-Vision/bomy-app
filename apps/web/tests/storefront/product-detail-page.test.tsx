// @vitest-environment jsdom
// R5b: structure of the product detail page, pinned on the old markup first (behaviour only).
// The two client parts are mocked; they have their own test files. Looks are asserted in the
// "R5b look" block added with the restyle.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getProductBySlug } = vi.hoisted(() => ({ getProductBySlug: vi.fn() }))
vi.mock("next/navigation", () => ({
  // The real notFound() throws; this page does not await it.
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
}))
vi.mock("@/app/products/queries", () => ({ getProductBySlug }))
vi.mock("@/app/products/[storeSlug]/[productSlug]/product-image-gallery", () => ({
  ProductImageGallery: () => <div data-testid="gallery" />,
}))
vi.mock("@/app/products/[storeSlug]/[productSlug]/variant-picker", () => ({
  VariantPicker: () => <div data-testid="picker" />,
}))

import ProductDetailPage from "@/app/products/[storeSlug]/[productSlug]/page"

const PRODUCT = {
  id: "p1",
  name: "Tea",
  slug: "tea",
  description: "A fine tea.",
  coverImageUrl: null,
  bodyHtml: null,
  metaTitle: null,
  metaDescription: null,
  ogImageUrl: null,
  storeId: "s1",
  storeName: "Acme",
  storeSlug: "acme",
  storeExcerpt: null,
  storeDescription: null,
  categoryId: null,
  variants: [],
  images: [],
}

async function render(over: Record<string, unknown> = {}) {
  getProductBySlug.mockResolvedValue({ ...PRODUCT, ...over })
  const el = await ProductDetailPage({
    params: Promise.resolve({ storeSlug: "acme", productSlug: "tea" }),
  })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}

beforeEach(() => getProductBySlug.mockReset())

describe("ProductDetailPage structure", () => {
  it("breadcrumb goes Products, store, product with the right links", async () => {
    const d = await render()
    const nav = d.querySelector("main nav")!
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ])
    expect(links).toEqual([
      ["Products", "/products"],
      ["Acme", "/brands/acme"],
    ])
    expect(nav.textContent).toContain("Tea")
  })

  it("the h1 is the product name; the description shows only when set", async () => {
    let d = await render()
    expect(d.querySelector("h1")!.textContent).toBe("Tea")
    expect(d.body.textContent).toContain("A fine tea.")
    d = await render({ description: null })
    expect(d.body.textContent).not.toContain("A fine tea.")
  })

  it("the gallery and the picker are on the page", async () => {
    const d = await render()
    expect(d.querySelector('[data-testid="gallery"]')).not.toBeNull()
    expect(d.querySelector('[data-testid="picker"]')).not.toBeNull()
  })

  it("'Product Details' appears only with bodyHtml", async () => {
    let d = await render()
    expect(d.body.textContent).not.toContain("Product Details")
    d = await render({ bodyHtml: "<p>Hello story</p>" })
    expect(d.body.textContent).toContain("Product Details")
    expect(d.body.textContent).toContain("Hello story")
  })

  it("a missing product is a not-found", async () => {
    getProductBySlug.mockResolvedValue(null)
    await expect(
      ProductDetailPage({ params: Promise.resolve({ storeSlug: "x", productSlug: "y" }) }),
    ).rejects.toThrow("NOT_FOUND")
  })
})
