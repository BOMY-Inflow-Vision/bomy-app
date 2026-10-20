import { describe, expect, it } from "vitest"

import { productBadge } from "@/lib/product-badge"

const NOW = new Date("2026-10-20T12:00:00Z")
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)
const base = { activeVariantCount: 2, inStockVariantCount: 1, now: NOW }

describe("productBadge", () => {
  it("no active variants gives no badge (not Sold out)", () => {
    expect(
      productBadge({
        ...base,
        activeVariantCount: 0,
        inStockVariantCount: 0,
        createdAt: daysAgo(1),
      }),
    ).toBeNull()
  })
  it("active variants all at zero stock is Sold out", () => {
    expect(
      productBadge({
        ...base,
        activeVariantCount: 2,
        inStockVariantCount: 0,
        createdAt: daysAgo(30),
      }),
    ).toBe("Sold out")
  })
  it("one variant in stock is not Sold out", () => {
    expect(productBadge({ ...base, createdAt: daysAgo(30) })).toBeNull()
  })
  it.each([
    [13, "New"],
    [14, "New"],
    [15, null],
  ])("created %i days ago and in stock gives %s", (days, want) => {
    expect(productBadge({ ...base, createdAt: daysAgo(days) })).toBe(want)
  })
  it("Sold out wins over New", () => {
    expect(productBadge({ ...base, inStockVariantCount: 0, createdAt: daysAgo(1) })).toBe(
      "Sold out",
    )
  })
  it("a product created in the future counts as New, not an error", () => {
    expect(productBadge({ ...base, createdAt: daysAgo(-1) })).toBe("New")
  })
})
