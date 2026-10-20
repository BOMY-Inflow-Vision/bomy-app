// @vitest-environment jsdom
// R4 follow-up: a long, unbroken category name must not widen the brand store page. The section
// heading wraps anywhere, the header row wraps, and the "View all" link stays short (its name
// still says which category).
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getStorePage, getBrandSubscriberAvatars } = vi.hoisted(() => ({
  getStorePage: vi.fn(),
  getBrandSubscriberAvatars: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(null) }))
vi.mock("next/navigation", () => ({ notFound: () => Promise.reject(new Error("NOT_FOUND")) }))
vi.mock("@/app/brands/[slug]/queries", () => ({ getStorePage, getBrandSubscriberAvatars }))

import StorePage from "@/app/brands/[slug]/page"

const LONG = "R4LONGCATEGORYNAME" + "X".repeat(42)
const STORE = {
  id: "s1",
  name: "Acme",
  slug: "acme",
  description: null,
  excerpt: null,
  bodyHtml: null,
  videoId: null,
  metaTitle: null,
  metaDescription: null,
  ogImageUrl: null,
}
const PRODUCT = { id: "p1", name: "Tea", slug: "tea", coverImageUrl: null }

async function render(hasMore: boolean) {
  getStorePage.mockResolvedValue({
    store: STORE,
    categorySections: [{ category: { name: LONG, slug: "long" }, products: [PRODUCT], hasMore }],
    uncategorized: { products: [PRODUCT], hasMore },
  })
  const el = await StorePage({ params: Promise.resolve({ slug: "acme" }) })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}
const has = (el: Element | null, tokens: string[]) => {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

beforeEach(() => {
  getStorePage.mockReset()
  getBrandSubscriberAvatars.mockReset()
})

describe("brand store page section header with a long category name", () => {
  it("the heading may break anywhere and may shrink", async () => {
    const d = await render(true)
    const h2 = Array.from(d.querySelectorAll("h2")).find((h) => h.textContent === LONG)!
    has(h2, ["min-w-0", "[overflow-wrap:anywhere]"])
  })

  it("the header row wraps instead of overflowing", async () => {
    const d = await render(true)
    const h2 = Array.from(d.querySelectorAll("h2")).find((h) => h.textContent === LONG)!
    has(h2.parentElement, ["flex", "flex-wrap", "justify-between"])
  })

  it("the category link shows a short label and still names the category", async () => {
    const d = await render(true)
    const link = d.querySelector('a[href="/brands/acme/products?category=long"]')!
    expect(link.textContent).toBe("View all")
    expect(link.getAttribute("aria-label")).toBe(`View all in ${LONG}`)
  })

  it("the Uncategorized link is unchanged", async () => {
    const d = await render(true)
    const link = d.querySelector('a[href="/brands/acme/products?category=__uncategorized"]')!
    expect(link.textContent).toBe("View all")
  })

  it("no link when a section has no more products", async () => {
    const d = await render(false)
    expect(d.querySelector('a[href^="/brands/acme/products"]')).toBeNull()
  })
})
