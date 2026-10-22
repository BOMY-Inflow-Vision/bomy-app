// R3 Task 2, layer 1 (always runs): the mapping and the empty result, with the query layer stubbed.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("@bomy/db", () => ({ makeDb: vi.fn(), schema: {}, withPublicRead: vi.fn() }))
vi.mock("@/app/products/queries", () => ({ getProducts: vi.fn() }))

import { getHomeData, type HomeDeps } from "@/app/_home/home-queries"

const none: HomeDeps = {
  featured: () => Promise.resolve(null),
  favourites: () => Promise.resolve([]),
  categories: () => Promise.resolve([]),
  brands: () => Promise.resolve([]),
  counts: () => Promise.resolve({ brands: 0, products: 0 }),
}

describe("getHomeData (stubbed reads)", () => {
  it("returns an empty result when every read is empty", async () => {
    expect(await getHomeData(none)).toEqual({
      featured: null,
      favourites: [],
      categories: [],
      brands: [],
      counts: { brands: 0, products: 0, categories: 0 },
    })
  })

  it("keeps a featured product without a price (price null)", async () => {
    const featured = {
      id: "f",
      name: "F",
      slug: "f",
      storeName: "S",
      storeSlug: "s",
      coverImageUrl: "https://img.test/f.jpg",
      minPriceSen: null,
    }
    const data = await getHomeData({ ...none, featured: () => Promise.resolve(featured) })
    expect(data.featured).toEqual(featured)
    expect(data.featured?.minPriceSen).toBeNull()
  })

  it("counts every category with a product but passes on only the top twelve", async () => {
    const cats = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      activeProductCount: 15 - i,
    }))
    const data = await getHomeData({ ...none, categories: () => Promise.resolve(cats) })
    expect(data.categories).toHaveLength(12)
    expect(data.categories[0]!.id).toBe("c0")
    expect(data.counts.categories).toBe(15)
  })

  it("runs the five reads separately and merges the counts", async () => {
    const data = await getHomeData({
      ...none,
      counts: () => Promise.resolve({ brands: 4, products: 11 }),
    })
    expect(data.counts).toEqual({ brands: 4, products: 11, categories: 0 })
  })
})

describe("home-queries source", () => {
  it("never imports withAdmin, so a home load writes no audit row", () => {
    const src = readFileSync(join(__dirname, "../../src/app/_home/home-queries.ts"), "utf8")
    expect(src).not.toMatch(/withAdmin/)
    expect(src).toMatch(/withPublicRead/)
  })
})
