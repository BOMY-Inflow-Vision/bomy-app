import { describe, expect, it } from "vitest"

import { PENDING_GRACE_MS, isPendingAbandoned } from "../../src/lib/membership"

const now = new Date("2026-06-22T12:00:00.000Z")

describe("isPendingAbandoned", () => {
  it("true when pending, no payment id, and created past the grace window", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(isPendingAbandoned({ status: "pending", hitpayPaymentId: null, createdAt }, now)).toBe(
      true,
    )
  })

  it("false when pending but still inside the grace window (just paid, awaiting webhook)", () => {
    const createdAt = new Date(now.getTime() - 60_000) // 1 minute ago
    expect(isPendingAbandoned({ status: "pending", hitpayPaymentId: null, createdAt }, now)).toBe(
      false,
    )
  })

  it("false when a payment id is present even if old (payment was confirmed)", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(
      isPendingAbandoned({ status: "pending", hitpayPaymentId: "pay_123", createdAt }, now),
    ).toBe(false)
  })

  it("false when status is not pending", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(isPendingAbandoned({ status: "active", hitpayPaymentId: null, createdAt }, now)).toBe(
      false,
    )
  })

  it("grace window is 30 minutes", () => {
    expect(PENDING_GRACE_MS).toBe(30 * 60 * 1000)
  })
})
