import { describe, expect, it } from "vitest"

import { displayPspRef } from "../../src/lib/psp-display"

describe("displayPspRef", () => {
  it("shows the psp_* value when present", () => {
    expect(displayPspRef("hitpay", "rb_new", "rb_new")).toBe("rb_new")
  })

  it("shows the hitpay_* value for a legacy-only HitPay row (before 0040)", () => {
    expect(displayPspRef("hitpay", null, "rb_legacy")).toBe("rb_legacy")
  })

  it("shows a dash only when the row has no reference", () => {
    expect(displayPspRef("hitpay", null, null)).toBe("—")
  })

  it("never shows a hitpay_* value on a non-HitPay row", () => {
    expect(displayPspRef("stripe", null, "stray")).toBe("—")
    expect(displayPspRef("stripe", "pi_1", null)).toBe("pi_1")
  })
})
