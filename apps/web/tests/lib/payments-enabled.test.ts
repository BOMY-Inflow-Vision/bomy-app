import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { paymentsEnabled } from "@/lib/payments-enabled"

describe("paymentsEnabled()", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env["HITPAY_API_KEY"]
    delete process.env["HITPAY_API_URL"]
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns true when both HITPAY_API_KEY and HITPAY_API_URL are set", () => {
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    expect(paymentsEnabled()).toBe(true)
  })

  it("returns false when HITPAY_API_KEY is unset", () => {
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when HITPAY_API_URL is unset", () => {
    process.env["HITPAY_API_KEY"] = "test-key"
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when HITPAY_API_KEY is the empty string", () => {
    process.env["HITPAY_API_KEY"] = ""
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when HITPAY_API_URL is the empty string", () => {
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = ""
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when both are unset", () => {
    expect(paymentsEnabled()).toBe(false)
  })
})
