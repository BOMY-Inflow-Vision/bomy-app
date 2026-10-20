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

async function renderStore(storeOver: Record<string, unknown> = {}, sections = true) {
  getStorePage.mockResolvedValue({
    store: { ...STORE, ...storeOver },
    categorySections: sections
      ? [{ category: { name: "Tea", slug: "tea" }, products: [PRODUCT], hasMore: false }]
      : [],
    uncategorized: { products: [], hasMore: false },
  })
  const el = await StorePage({ params: Promise.resolve({ slug: "acme" }) })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}
const subscribe = (d: Document) => d.querySelector('a[href="/brands/acme/subscribe"]')!

describe("brand store page heading (R5a)", () => {
  it("uses the shared heading, centred, with a store name that may break anywhere", async () => {
    const d = await renderStore({ name: "N".repeat(80) })
    const h1 = d.querySelector("h1")!
    expect(h1.textContent).toBe("N".repeat(80))
    has(h1, ["sm:text-4xl", "[overflow-wrap:anywhere]"])
    has(h1.closest("header"), ["text-center"])
  })
})

describe("brand store page top grid (R5a)", () => {
  it("with a story: a two-column grid whose two columns may both shrink", async () => {
    const d = await renderStore({ bodyHtml: "<p>Hello</p>" })
    const grid = d.querySelector("main > .grid")!
    has(grid, ["grid", "grid-cols-1", "gap-8", "md:grid-cols-2"])
    expect(grid.children).toHaveLength(2)
    for (const col of Array.from(grid.children)) has(col, ["min-w-0"])
  })

  it("the story sits in a white bento panel and its text breaks anywhere with images bounded", async () => {
    const d = await renderStore({ bodyHtml: "<p>Hello</p>" })
    const h2 = Array.from(d.querySelectorAll("h2")).find((h) => h.textContent === "Our Story")!
    const panel = h2.parentElement!
    has(panel, ["rounded-bento", "border", "border-border", "bg-card", "p-6"])
    const body = panel.querySelector(".prose")!
    // break-words, not anywhere: "anywhere" also shrinks table columns to one character each, which
    // mangles a normal seller table on a phone; the table scrolls inside its own box instead.
    has(body, ["min-w-0", "break-words", "[&_img]:h-auto", "[&_img]:max-w-full"])
    expect(body.classList.contains("[overflow-wrap:anywhere]")).toBe(false)
    expect(body.textContent).toContain("Hello")
  })

  it("without a story: no story column, no two-column grid, the right content takes the full row", async () => {
    const d = await renderStore({ bodyHtml: null })
    expect(d.body.textContent).not.toContain("Our Story")
    expect(d.querySelector(".md\\:grid-cols-2")).toBeNull()
    const column = subscribe(d).parentElement!
    expect(column.parentElement!.tagName).toBe("MAIN")
    has(column, ["min-w-0", "flex", "flex-col"])
  })

  it("the Subscribe link always shows; the video column child only with a videoId", async () => {
    const without = await renderStore({ bodyHtml: null })
    expect(subscribe(without).parentElement!.children).toHaveLength(1)
    const withVideo = await renderStore({ bodyHtml: null, videoId: "dQw4w9WgXcQ" })
    const column = subscribe(withVideo).parentElement!
    expect(column.children.length).toBeGreaterThan(1)
    expect(subscribe(withVideo)).not.toBeNull()
  })

  it("does not read subscriber avatars for an anonymous visitor", async () => {
    await renderStore({ bodyHtml: null })
    expect(getBrandSubscriberAvatars).not.toHaveBeenCalled()
  })

  it("the empty state is a dashed bento box", async () => {
    const d = await renderStore({}, false)
    const empty = Array.from(d.querySelectorAll("p")).find(
      (p) => p.textContent === "No products yet.",
    )!
    has(empty, ["rounded-bento", "border", "border-dashed"])
  })
})
