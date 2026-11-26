import { describe, expect, it } from "vitest"

import { PENDING_GRACE_MS, isPendingAbandoned } from "../../src/lib/membership"

const now = new Date("2026-06-22T12:00:00.000Z")

describe("isPendingAbandoned", () => {
  it("true when pending, no payment id, and created past the grace window", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(
      isPendingAbandoned(
        { status: "pending", pspPaymentId: null, hitpayPaymentId: null, createdAt },
        now,
      ),
    ).toBe(true)
  })

  it("false when pending but still inside the grace window (just paid, awaiting webhook)", () => {
    const createdAt = new Date(now.getTime() - 60_000) // 1 minute ago
    expect(
      isPendingAbandoned(
        { status: "pending", pspPaymentId: null, hitpayPaymentId: null, createdAt },
        now,
      ),
    ).toBe(false)
  })

  it("false when a payment id is present even if old (payment was confirmed)", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(
      isPendingAbandoned(
        { status: "pending", pspPaymentId: "pay_123", hitpayPaymentId: "pay_123", createdAt },
        now,
      ),
    ).toBe(false)
  })

  it("false when only psp_payment_id is set (a provider-neutral payment)", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(
      isPendingAbandoned(
        { status: "pending", pspPaymentId: "pi_1", hitpayPaymentId: null, createdAt },
        now,
      ),
    ).toBe(false)
  })

  it("false when only hitpay_payment_id is set (paid by pre-dual-write webhook code)", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(
      isPendingAbandoned(
        { status: "pending", pspPaymentId: null, hitpayPaymentId: "pay_old", createdAt },
        now,
      ),
    ).toBe(false)
  })

  it("false when status is not pending", () => {
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 1)
    expect(
      isPendingAbandoned(
        { status: "active", pspPaymentId: null, hitpayPaymentId: null, createdAt },
        now,
      ),
    ).toBe(false)
  })

  it("grace window is 30 minutes", () => {
    expect(PENDING_GRACE_MS).toBe(30 * 60 * 1000)
  })
})
