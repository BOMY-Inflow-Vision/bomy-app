import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { verifyWebhookSignature } from "../src/webhook.js"

const SALT = "super-secret-salt"

function makeBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

function makeHmac(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort()
  const message = sorted.map((k) => params[k]).join("")
  return createHmac("sha256", SALT).update(message).digest("hex")
}

describe("verifyWebhookSignature", () => {
  it("returns true for a valid signature", () => {
    const params = {
      payment_id: "pay_abc123",
      amount: "100.00",
      currency: "MYR",
      status: "succeeded",
    }
    const hmac = makeHmac(params)
    const rawBody = makeBody({ ...params, hmac })
    expect(verifyWebhookSignature(rawBody, hmac, SALT)).toBe(true)
  })

  it("returns false when the signature is wrong", () => {
    const params = {
      payment_id: "pay_abc123",
      amount: "100.00",
      currency: "MYR",
      status: "succeeded",
    }
    const rawBody = makeBody({ ...params, hmac: "deadbeef" })
    expect(verifyWebhookSignature(rawBody, "deadbeef", SALT)).toBe(false)
  })

  it("returns false when a payload field is tampered", () => {
    const params = {
      payment_id: "pay_abc123",
      amount: "100.00",
      currency: "MYR",
      status: "succeeded",
    }
    const hmac = makeHmac(params)
    const tampered = makeBody({ ...params, amount: "1.00", hmac })
    expect(verifyWebhookSignature(tampered, hmac, SALT)).toBe(false)
  })

  it("returns false when the salt is wrong", () => {
    const params = { payment_id: "pay_abc123", amount: "100.00" }
    const hmac = makeHmac(params)
    const rawBody = makeBody({ ...params, hmac })
    expect(verifyWebhookSignature(rawBody, hmac, "wrong-salt")).toBe(false)
  })

  it("handles payloads with no extra fields beyond hmac", () => {
    const params = { payment_id: "pay_single" }
    const hmac = makeHmac(params)
    const rawBody = makeBody({ ...params, hmac })
    expect(verifyWebhookSignature(rawBody, hmac, SALT)).toBe(true)
  })

  it("sorts fields deterministically regardless of URLSearchParams order", () => {
    const params = {
      z_last: "zzz",
      a_first: "aaa",
      m_middle: "mmm",
    }
    const sortedKeys = Object.keys(params).sort()
    const message = sortedKeys.map((k) => params[k as keyof typeof params]).join("")
    const hmac = createHmac("sha256", SALT).update(message).digest("hex")

    // Body with reversed key order — should still verify correctly
    const rawBody = new URLSearchParams({
      m_middle: "mmm",
      z_last: "zzz",
      a_first: "aaa",
      hmac,
    }).toString()

    expect(verifyWebhookSignature(rawBody, hmac, SALT)).toBe(true)
  })

  it("returns false if hmac lengths differ (prevents timing attacks being triggered)", () => {
    const params = { payment_id: "pay_x" }
    const rawBody = makeBody({ ...params, hmac: "short" })
    expect(verifyWebhookSignature(rawBody, "short", SALT)).toBe(false)
  })
})
