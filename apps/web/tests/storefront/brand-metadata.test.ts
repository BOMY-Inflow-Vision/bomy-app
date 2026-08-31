import { describe, expect, it, vi } from "vitest"

vi.mock("../../src/app/brands/[slug]/queries", () => ({ getStorePage: vi.fn() }))

import { generateMetadata } from "../../src/app/brands/[slug]/page"
import { getStorePage } from "../../src/app/brands/[slug]/queries"

const mockGetStorePage = getStorePage as unknown as ReturnType<typeof vi.fn>

function storeData(
  overrides: Partial<{
    name: string
    excerpt: string | null
    description: string | null
    metaTitle: string | null
    metaDescription: string | null
    ogImageUrl: string | null
  }> = {},
) {
  return {
    store: {
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
      ...overrides,
    },
    categorySections: [],
    uncategorized: { products: [], hasMore: false },
  }
}

describe("brands/[slug] generateMetadata", () => {
  it("uses explicit SEO fields when set", async () => {
    mockGetStorePage.mockResolvedValueOnce(
      storeData({
        metaTitle: "Custom Title",
        metaDescription: "Custom description",
        ogImageUrl: "https://cdn.example.com/og.png",
      }),
    )
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.title).toBe("Custom Title")
    expect(metadata.description).toBe("Custom description")
    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/og.png"])
  })

  it("falls back to name/excerpt and omits images with no ogImageUrl", async () => {
    mockGetStorePage.mockResolvedValueOnce(storeData({ excerpt: "Brief intro" }))
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.title).toBe("Acme")
    expect(metadata.description).toBe("Brief intro")
    expect(metadata.openGraph?.images).toBeUndefined()
  })

  it("falls back to description when excerpt is empty", async () => {
    mockGetStorePage.mockResolvedValueOnce(storeData({ description: "Full description" }))
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.description).toBe("Full description")
  })

  it("omits description entirely when metaDescription/excerpt/description are all empty", async () => {
    mockGetStorePage.mockResolvedValueOnce(storeData())
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.description).toBeUndefined()
  })

  it("returns an empty metadata object when the store is not found", async () => {
    mockGetStorePage.mockResolvedValueOnce(null)
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "missing" }) })
    expect(metadata).toEqual({})
  })
})
