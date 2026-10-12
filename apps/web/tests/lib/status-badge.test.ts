import { describe, expect, it } from "vitest"

import {
  HEADER_PILL_CLASS,
  ORDER_HEADER_PILL_CLASS,
  productStatusVariant,
  storeStatusVariant,
} from "@/lib/status-badge"

describe("productStatusVariant", () => {
  it.each([
    ["active", "success"],
    ["draft", "muted"],
    ["archived", "muted"],
    ["something_new", "muted"],
    ["constructor", "muted"],
    ["", "muted"],
  ] as const)("%s -> %s", (status, variant) => {
    expect(productStatusVariant(status)).toBe(variant)
  })
})

describe("storeStatusVariant", () => {
  it.each([
    ["active", "success"],
    ["pending", "warning"],
    ["suspended", "destructive-subtle"],
    ["something_new", "muted"],
    ["constructor", "muted"],
    ["", "muted"],
  ] as const)("%s -> %s", (status, variant) => {
    expect(storeStatusVariant(status)).toBe(variant)
  })
})

describe("header pill classes (Badge adds a 1 px border, so geometry needs border-0)", () => {
  it("the seller dashboard store status keeps its old size", () => {
    expect(HEADER_PILL_CLASS).toBe("border-0 px-3 py-1 font-medium")
  })

  it("the order detail header keeps its old size", () => {
    expect(ORDER_HEADER_PILL_CLASS).toBe("border-0 px-3 py-1 text-sm font-medium capitalize")
  })
})
