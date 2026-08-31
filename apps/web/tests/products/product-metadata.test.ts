import { describe, expect, it, vi } from "vitest"

vi.mock("../../src/app/products/queries", () => ({ getProductBySlug: vi.fn() }))

import { generateMetadata } from "../../src/app/products/[storeSlug]/[productSlug]/page"
import { getProductBySlug } from "../../src/app/products/queries"

const mockGetProductBySlug = getProductBySlug as unknown as ReturnType<typeof vi.fn>

function productData(
  overrides: Partial<{
    name: string
    description: string | null
    coverImageUrl: string | null
    metaTitle: string | null
    metaDescription: string | null
    ogImageUrl: string | null
    storeExcerpt: string | null
    storeDescription: string | null
    images: Array<{ id: string; url: string; altText: string | null; sortOrder: number }>
  }> = {},
) {
  return {
    id: "p1",
    name: "Widget",
    slug: "widget",
    description: null,
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
    ...overrides,
  }
}

describe("products/[storeSlug]/[productSlug] generateMetadata", () => {
  it("uses explicit SEO fields when set", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(
      productData({
        metaTitle: "Custom Product Title",
        metaDescription: "Custom product description",
        ogImageUrl: "https://cdn.example.com/product-og.png",
      }),
    )
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.title).toBe("Custom Product Title")
    expect(metadata.description).toBe("Custom product description")
    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/product-og.png"])
  })

  it("falls back to name/description and omits images with no ogImageUrl", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(productData({ description: "A fine widget" }))
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.title).toBe("Widget")
    expect(metadata.description).toBe("A fine widget")
    expect(metadata.openGraph?.images).toBeUndefined()
  })

  it("falls back to the store's excerpt when the product has no description of its own", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(
      productData({ storeExcerpt: "A fine little shop", storeDescription: "Full store bio" }),
    )
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.description).toBe("A fine little shop")
  })

  it("falls back to the store's description when neither the product description nor the store excerpt is set", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(productData({ storeDescription: "Full store bio" }))
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.description).toBe("Full store bio")
  })

  it("omits description entirely when metaDescription/description/storeExcerpt/storeDescription are all empty", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(productData())
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.description).toBeUndefined()
  })

  it("falls back to coverImageUrl for the OG image when ogImageUrl is unset", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(
      productData({ coverImageUrl: "https://cdn.example.com/cover.png" }),
    )
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/cover.png"])
  })

  it("falls back to the first product image when neither ogImageUrl nor coverImageUrl is set", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(
      productData({
        images: [
          { id: "img1", url: "https://cdn.example.com/gallery-1.png", altText: null, sortOrder: 0 },
          { id: "img2", url: "https://cdn.example.com/gallery-2.png", altText: null, sortOrder: 1 },
        ],
      }),
    )
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/gallery-1.png"])
  })

  it("omits OG images entirely when ogImageUrl, coverImageUrl, and images are all unset", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(productData())
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.openGraph?.images).toBeUndefined()
  })

  it("prefers ogImageUrl over coverImageUrl and product images when all three are set", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(
      productData({
        ogImageUrl: "https://cdn.example.com/explicit-og.png",
        coverImageUrl: "https://cdn.example.com/cover.png",
        images: [
          { id: "img1", url: "https://cdn.example.com/gallery-1.png", altText: null, sortOrder: 0 },
        ],
      }),
    )
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/explicit-og.png"])
  })

  it("returns an empty metadata object when the product is not found", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(null)
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "missing" }),
    })
    expect(metadata).toEqual({})
  })
})
