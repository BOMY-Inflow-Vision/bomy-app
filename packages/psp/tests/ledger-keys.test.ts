/**
 * ledgerKey — HitPay keys must reproduce, byte for byte, every literal key format in
 * apps/api/src/routes/webhooks/hitpay.ts (the refund handler recomputes them to detect
 * replays, and ledger_entries is append-only). Stripe keys get the `stripe:` prefix
 * (design §4.3).
 */
import { describe, expect, it } from "vitest"

import { ledgerKey } from "../src/ledger-keys.js"
import { pspRef } from "../src/transition.js"

const pay = "pay_9f8e"
const sub = "0b9c3a4e-1111-4111-8111-111111111111"
const ref = "rf_77"

describe("ledgerKey — hitpay (legacy, unprefixed)", () => {
  it.each([
    [["membership", "recurring", pay, "credit"], `membership:recurring:${pay}:credit`],
    [["brand_sub", sub, pay, "credit"], `brand_sub:${sub}:${pay}:credit`],
    [["brand_sub", sub, pay, "debit", "payout"], `brand_sub:${sub}:${pay}:debit:payout`],
    [["brand_sub", sub, pay, "debit", "fee"], `brand_sub:${sub}:${pay}:debit:fee`],
    [["dup_charge", pay, "credit"], `dup_charge:${pay}:credit`],
    [["dup_charge", pay, "debit"], `dup_charge:${pay}:debit`],
    [["dup_charge", pay, ref, "debit"], `dup_charge:${pay}:${ref}:debit`],
    [["refund", pay, sub, "debit"], `refund:${pay}:${sub}:debit`],
    [["refund", pay, ref, sub, "debit"], `refund:${pay}:${ref}:${sub}:debit`],
  ])("%j → %s", (parts, expected) => {
    expect(ledgerKey("hitpay", ...parts)).toBe(expected)
  })
})

describe("ledgerKey — stripe (namespaced)", () => {
  it.each([
    [["membership", "invoice", "in_1", "credit"], "stripe:membership:invoice:in_1:credit"],
    [["brand_sub", sub, "pi_1", "debit", "fee"], `stripe:brand_sub:${sub}:pi_1:debit:fee`],
    [["dup_charge", "pi_1", "re_1", "debit"], "stripe:dup_charge:pi_1:re_1:debit"],
    [["refund", "re_1", sub, "debit"], `stripe:refund:re_1:${sub}:debit`],
  ])("%j → %s", (parts, expected) => {
    expect(ledgerKey("stripe", ...parts)).toBe(expected)
  })

  it("a stripe key can never equal the hitpay key for the same parts", () => {
    const parts = ["dup_charge", "x", "credit"]
    expect(ledgerKey("stripe", ...parts)).not.toBe(ledgerKey("hitpay", ...parts))
  })
})

describe("ledgerKey — guards", () => {
  it("rejects no parts", () => {
    expect(() => ledgerKey("hitpay")).toThrow(/at least one part/)
  })

  it("rejects an empty part (a blank id would merge distinct payments)", () => {
    expect(() => ledgerKey("hitpay", "membership", "recurring", "", "credit")).toThrow(/empty/)
    expect(() => ledgerKey("stripe", "")).toThrow(/empty/)
  })
})

describe("pspRef (transition fallback)", () => {
  it("prefers the psp_* value", () => {
    expect(pspRef("hitpay", "psp", "legacy")).toBe("psp")
  })

  it("falls back to hitpay_* for HitPay rows written before dual-write", () => {
    expect(pspRef("hitpay", null, "legacy")).toBe("legacy")
    expect(pspRef("hitpay", null, null)).toBeNull()
  })

  it("never falls back for a non-HitPay row", () => {
    expect(pspRef("stripe", null, "legacy")).toBeNull()
    expect(pspRef("stripe", "pi_1", null)).toBe("pi_1")
  })
})
