// @vitest-environment jsdom
//
// Store products page (PR 5d-10, man-a5..a7). Written first against the hand-made tile, empty box
// and emoji placeholder (baseline); after the swap only the TOKENS / placeholder expectations change.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getStoreProducts } = vi.hoisted(() => ({ getStoreProducts: vi.fn() }))
vi.mock("@/app/brands/[slug]/products/queries", () => ({ getStoreProducts }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
}))

import StoreProductsPage from "@/app/brands/[slug]/products/page"

const TOKENS = {
  tile: ["group", "block", "overflow-hidden", "rounded-xl", "border", "bg-background", "shadow-sm"],
  empty: ["rounded-xl", "border", "border-dashed", "py-16", "text-center"],
}

async function render(products: unknown[]) {
  getStoreProducts.mockResolvedValue({ store: { name: "Acme", slug: "acme" }, products })
  const el = await StoreProductsPage({
    params: Promise.resolve({ slug: "acme" }),
    searchParams: Promise.resolve({}),
  })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}
function has(el: Element | null, tokens: string[]) {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

const WITH_IMAGE = { id: "1", slug: "tea", name: "Tea", coverImageUrl: "https://x.test/t.jpg" }
const NO_IMAGE = { id: "2", slug: "mug", name: "Mug", coverImageUrl: null }

beforeEach(() => getStoreProducts.mockReset())

describe("store products page", () => {
  it("lists tiles with the product name, destination and image alt", async () => {
    const doc = await render([WITH_IMAGE, NO_IMAGE])
    const links = Array.from(doc.querySelectorAll("li a"))
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/products/acme/tea",
      "/products/acme/mug",
    ])
    expect(links.map((a) => a.textContent.trim())).toContain("Tea")
    expect(doc.querySelector("img")!.getAttribute("alt")).toBe("Tea")
    expect(doc.querySelectorAll("img")).toHaveLength(1)
  })

  it("the product name changes colour on hover of the tile", async () => {
    const doc = await render([WITH_IMAGE])
    const name = doc.querySelector("li p")!
    expect(name.classList.contains("group-hover:text-primary")).toBe(true)
    expect(name.closest(".group")).not.toBeNull()
  })

  it("the whole tile, border included, is inside the link", async () => {
    const doc = await render([WITH_IMAGE])
    const link = doc.querySelector("li a")!
    const border = Array.from(link.querySelectorAll("*"))
      .concat(link)
      .find((e) => e.classList.contains("border") && e.classList.contains("shadow-sm"))
    expect(border).toBeDefined()
    expect(link.contains(border!)).toBe(true)
  })

  it("a product without a cover image shows a placeholder, a product with one does not", async () => {
    const withImg = await render([WITH_IMAGE])
    expect(withImg.querySelector("li svg")).toBeNull()
    const noImg = await render([NO_IMAGE])
    expect(noImg.querySelector("img")).toBeNull()
    expect(noImg.querySelector("li")!.textContent.trim()).toContain("📦")
  })

  it("empty state keeps its words and the back link", async () => {
    const doc = await render([])
    expect(doc.body.textContent).toContain("No products found in this category.")
    expect(doc.querySelector("ul")).toBeNull()
    const back = Array.from(doc.querySelectorAll("a")).find((a) =>
      a.textContent.includes("Back to storefront"),
    )!
    expect(back.getAttribute("href")).toBe("/brands/acme")
  })

  it("404 when the store is unknown", async () => {
    getStoreProducts.mockResolvedValue(null)
    await expect(
      StoreProductsPage({
        params: Promise.resolve({ slug: "nope" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NOT_FOUND")
  })

  it("class tokens (updated by the swap)", async () => {
    const tile = (await render([WITH_IMAGE])).querySelector("li a")!
    has(tile, TOKENS.tile)
    const empty = Array.from((await render([])).querySelectorAll("p")).find((p) =>
      p.textContent.includes("No products found"),
    )!
    has(empty, TOKENS.empty)
  })
})
