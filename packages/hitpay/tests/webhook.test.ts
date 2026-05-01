import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { verifyWebhookSignature } from "../src/webhook.js"

const SALT = "super-secret-salt"

function makeSignature(rawBody: string): string {
  return createHmac("sha256", SALT).update(rawBody).digest("hex")
}

describe("verifyWebhookSignature", () => {
  it("returns true for a valid JSON body + correct signature", () => {
    const body = JSON.stringify({ payment_id: "pay_abc", amount: "100.00", status: "succeeded" })
    const sig = makeSignature(body)
    expect(verifyWebhookSignature(body, sig, SALT)).toBe(true)
  })

  it("returns false when the signature is wrong", () => {
    const body = JSON.stringify({ payment_id: "pay_abc", amount: "100.00" })
    expect(verifyWebhookSignature(body, "deadbeef", SALT)).toBe(false)
  })

  it("returns false when the body is tampered after signing", () => {
    const body = JSON.stringify({ payment_id: "pay_abc", amount: "100.00" })
    const sig = makeSignature(body)
    const tampered = JSON.stringify({ payment_id: "pay_abc", amount: "1.00" })
    expect(verifyWebhookSignature(tampered, sig, SALT)).toBe(false)
  })

  it("returns false when the salt is wrong", () => {
    const body = JSON.stringify({ payment_id: "pay_abc" })
    const sig = makeSignature(body)
    expect(verifyWebhookSignature(body, sig, "wrong-salt")).toBe(false)
  })

  it("returns false if signature lengths differ", () => {
    const body = JSON.stringify({ payment_id: "pay_x" })
    expect(verifyWebhookSignature(body, "short", SALT)).toBe(false)
  })

  it("is sensitive to byte-level body differences — JSON serialisation must be preserved verbatim", () => {
    const body1 = '{"payment_id":"pay_x","amount":"1.00"}'
    const body2 = '{"amount":"1.00","payment_id":"pay_x"}'
    const sig = makeSignature(body1)
    expect(verifyWebhookSignature(body2, sig, SALT)).toBe(false)
  })

  it("works with an empty body", () => {
    const body = ""
    const sig = makeSignature(body)
    expect(verifyWebhookSignature(body, sig, SALT)).toBe(true)
  })
})
