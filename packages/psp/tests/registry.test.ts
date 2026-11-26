import { afterEach, describe, expect, it } from "vitest"

import { HitPayProvider } from "../src/hitpay/provider.js"
import { StripeProvider } from "../src/stripe/provider.js"
import { getProvider, resetProviders, setProviderOverride } from "../src/registry.js"
import type { PaymentProvider } from "../src/types.js"

afterEach(() => {
  resetProviders()
})

describe("getProvider", () => {
  it("returns the HitPay adapter for 'hitpay'", () => {
    const p = getProvider("hitpay")
    expect(p).toBeInstanceOf(HitPayProvider)
    expect(p.id).toBe("hitpay")
  })

  it("is a lazy singleton per provider", () => {
    expect(getProvider("hitpay")).toBe(getProvider("hitpay"))
  })

  it("resetProviders drops the cached instance", () => {
    const first = getProvider("hitpay")
    resetProviders()
    expect(getProvider("hitpay")).not.toBe(first)
  })

  it("returns the Stripe placeholder for 'stripe': never configured (real adapter in PR 4)", () => {
    const p = getProvider("stripe")
    expect(p).toBeInstanceOf(StripeProvider)
    expect(p.id).toBe("stripe")
    expect(p.isConfigured()).toBe(false)
  })

  it("throws for an id outside the union (e.g. a corrupt DB value)", () => {
    expect(() => getProvider("paypal" as never)).toThrow(/Unknown PSP provider/)
  })

  it("setProviderOverride routes to a fake, and null removes it", () => {
    const fake = { id: "hitpay" } as unknown as PaymentProvider
    setProviderOverride("hitpay", fake)
    expect(getProvider("hitpay")).toBe(fake)
    setProviderOverride("hitpay", null)
    expect(getProvider("hitpay")).toBeInstanceOf(HitPayProvider)
  })

  it("an override can stand in for a provider that has no implementation yet", () => {
    const fake = { id: "stripe" } as unknown as PaymentProvider
    setProviderOverride("stripe", fake)
    expect(getProvider("stripe")).toBe(fake)
  })
})
