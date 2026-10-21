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

const has = (el: Element | null, tokens: string[]) => {
  expect(el, tokens.join(" ")).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("ProductDetailPage R5b look", () => {
  it("breadcrumb is a labelled ordered list that wraps; the current item is marked and may break anywhere", async () => {
    const d = await render()
    const nav = d.querySelector("main nav")!
    expect(nav.getAttribute("aria-label")).toBe("Breadcrumb")
    const ol = nav.querySelector("ol")!
    has(ol, ["flex", "min-w-0", "flex-wrap"])
    const current = nav.querySelector('[aria-current="page"]')!
    expect(current.textContent).toBe("Tea")
    has(current, ["[overflow-wrap:anywhere]"])
    for (const a of Array.from(nav.querySelectorAll("a"))) has(a, ["[overflow-wrap:anywhere]"])
    for (const sep of Array.from(nav.querySelectorAll('[aria-hidden="true"]')))
      expect(sep.textContent).toBe("/")
  })

  it("the h1 comes from PageHeading and the description is its description paragraph", async () => {
    const d = await render()
    const h1 = d.querySelector("h1")!
    has(h1, ["sm:text-4xl", "[overflow-wrap:anywhere]"])
    const p = Array.from(d.querySelectorAll("header p")).find(
      (x) => x.textContent === "A fine tea.",
    )
    expect(p).toBeTruthy()
    has(p!, ["text-base", "[overflow-wrap:anywhere]"])
  })

  it("the store eyebrow link uses the mono eyebrow style and breaks anywhere", async () => {
    const d = await render()
    const eyebrow = Array.from(d.querySelectorAll("article a")).find(
      (a) => a.textContent === "Acme",
    )!
    has(eyebrow, ["font-mono", "uppercase", "tracking-eyebrow", "[overflow-wrap:anywhere]"])
  })

  it("both columns of the grid may shrink", async () => {
    const d = await render()
    const cols = Array.from(d.querySelector("article")!.children)
    expect(cols).toHaveLength(2)
    for (const c of cols) has(c, ["min-w-0"])
  })

  it("the details sit in a white bento panel; the story text breaks with break-words, not anywhere", async () => {
    const d = await render({ bodyHtml: "<p>Hello story</p>" })
    const section = d.querySelector("section")!
    has(section, [
      "max-w-3xl",
      "min-w-0",
      "rounded-bento",
      "border",
      "border-border",
      "bg-card",
      "p-6",
    ])
    const prose = section.querySelector(".prose")!
    has(prose, ["min-w-0", "max-w-none", "break-words", "[&_img]:h-auto", "[&_img]:max-w-full"])
    expect(prose.classList.contains("[overflow-wrap:anywhere]")).toBe(false)
  })
})
