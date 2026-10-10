import { describe, expect, it } from "vitest"

import {
  hrefForStore,
  normalizeStoreId,
  type StoreOption,
} from "@/app/brand-subscriptions/store-filter-helpers"

const options: StoreOption[] = [
  { id: "s1", name: "Alpha", href: "/brand-subscriptions?storeId=s1" },
  { id: "s2", name: "Beta", href: "/brand-subscriptions?storeId=s2" },
]

describe("hrefForStore", () => {
  it("returns the clear-filter link for the All choice", () => {
    expect(hrefForStore("all", "/brand-subscriptions", options)).toBe("/brand-subscriptions")
  })
  it("returns the link of the chosen store", () => {
    expect(hrefForStore("s2", "/brand-subscriptions", options)).toBe(
      "/brand-subscriptions?storeId=s2",
    )
  })
  it("falls back to the clear-filter link for an unknown store", () => {
    expect(hrefForStore("nope", "/brand-subscriptions", options)).toBe("/brand-subscriptions")
  })
})

describe("normalizeStoreId", () => {
  it("keeps an id that is in the list", () => {
    expect(normalizeStoreId("s1", options)).toBe("s1")
  })
  it("drops an id that is not in the list", () => {
    expect(normalizeStoreId("zzz", options)).toBe("")
  })
  it("treats a missing or empty id as no filter", () => {
    expect(normalizeStoreId(undefined, options)).toBe("")
    expect(normalizeStoreId("", options)).toBe("")
  })
  it("drops a malformed value instead of passing it to the query", () => {
    expect(normalizeStoreId("not-a-uuid'; --", options)).toBe("")
  })
})
