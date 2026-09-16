import { describe, expect, it } from "vitest"

import { humanizePayoutError, type PayoutErrorCode } from "@/lib/payout-error-copy"

describe("humanizePayoutError", () => {
  it("uses the context-specific override when one exists", () => {
    expect(humanizePayoutError("createPayout", "NOT_FOUND")).toEqual({
      message: "Order not found or not completed.",
      toast: "error",
    })
    expect(humanizePayoutError("createPayout", "FORBIDDEN")).toEqual({
      message: "You don't have permission to create payouts.",
      toast: "error",
    })
  })

  it("falls back to the generic copy when a context has no override for the code", () => {
    expect(humanizePayoutError("createPayout", "UNAUTHENTICATED")).toEqual({
      message: "Your session has ended. Please sign in again.",
      toast: "error",
    })
    expect(humanizePayoutError("createPayout", "ALREADY_EXISTS")).toEqual({
      message: "A payout already exists for this order.",
      toast: "error",
    })
  })

  it("gives the same INVALID_INPUT code different copy per context", () => {
    expect(humanizePayoutError("markCompleted", "INVALID_INPUT").message).toBe(
      "Manual reference is required.",
    )
    expect(humanizePayoutError("markFailed", "INVALID_INPUT").message).toBe("Notes are required.")
    expect(humanizePayoutError("markProcessing", "INVALID_INPUT").message).toBe(
      "That input isn't valid.",
    )
  })

  it("gives the same NOT_FOUND code different copy per context", () => {
    expect(humanizePayoutError("createPayout", "NOT_FOUND").message).toBe(
      "Order not found or not completed.",
    )
    expect(humanizePayoutError("markProcessing", "NOT_FOUND").message).toBe(
      "Payout not found, or it's no longer pending.",
    )
    expect(humanizePayoutError("markCompleted", "NOT_FOUND").message).toBe(
      "Payout not found, or it's no longer pending/processing.",
    )
    expect(humanizePayoutError("markFailed", "NOT_FOUND").message).toBe(
      "Payout not found, or it's no longer pending/processing.",
    )
    expect(humanizePayoutError("refund", "NOT_FOUND").message).toBe("Duplicate charge not found.")
  })

  it("marks REFUND_OUTCOME_UNKNOWN as a warning, not an error", () => {
    expect(humanizePayoutError("refund", "REFUND_OUTCOME_UNKNOWN")).toEqual({
      message: "Refund outcome unknown — flagged for manual verification.",
      toast: "warning",
    })
  })

  it("marks REFUND_FAILED and ALREADY_PROCESSING as errors, not warnings", () => {
    expect(humanizePayoutError("refund", "REFUND_FAILED").toast).toBe("error")
    expect(humanizePayoutError("refund", "ALREADY_PROCESSING").toast).toBe("error")
  })

  it("covers every declared error code with non-empty generic copy", () => {
    const codes: PayoutErrorCode[] = [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "NOT_PAYABLE",
      "ALREADY_EXISTS",
      "INVALID_INPUT",
      "ALREADY_PROCESSING",
      "REFUND_FAILED",
      "REFUND_OUTCOME_UNKNOWN",
    ]
    for (const code of codes) {
      const copy = humanizePayoutError("createPayout", code)
      expect(copy.message.length).toBeGreaterThan(0)
      expect(["error", "warning"]).toContain(copy.toast)
    }
  })
})
