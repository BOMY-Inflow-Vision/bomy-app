import { describe, expect, it } from "vitest"

import { statusVariant, storeStatusVariant } from "@/lib/status-badge"

describe("statusVariant (brand subscriptions, memberships, goodie box)", () => {
  it.each([
    ["pending", "warning"],
    ["active", "success"],
    ["cancelled", "muted"],
    ["expired", "destructive-subtle"],
    ["payment_failed", "destructive-subtle"],
    ["dispatched", "success"],
    ["delivered", "info"],
    ["suspended", "destructive-subtle"],
    ["something_new", "muted"],
    ["constructor", "muted"],
    ["", "muted"],
  ] as const)("%s -> %s", (status, variant) => {
    expect(statusVariant(status)).toBe(variant)
  })
})

describe("storeStatusVariant", () => {
  it.each([
    ["pending", "warning"],
    ["active", "success"],
    ["suspended", "destructive-subtle"],
    ["something_new", "muted"],
    ["constructor", "muted"],
    ["", "muted"],
  ] as const)("%s -> %s", (status, variant) => {
    expect(storeStatusVariant(status)).toBe(variant)
  })
})
