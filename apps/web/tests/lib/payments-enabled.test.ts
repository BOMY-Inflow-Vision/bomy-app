/**
 * Unit truth table — payments gate (Stripe design PR 3, §3.4 / §13 decision 3).
 *
 * `@bomy/db` is mocked so each case controls exactly what platform_config returns (or that the
 * read throws). The real-DB path is covered by the action-level integration
 * suites (membership/actions, brand-subscription/actions, checkout/initiate).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@bomy/db", () => ({
  makeDb: vi.fn().mockReturnValue({ db: {}, close: vi.fn() }),
  schema: { platformConfig: { key: "key", value: "value" } },
  withAdmin: vi.fn(),
}))

import * as dbModule from "@bomy/db"
import { resetProviders, setProviderOverride, type PaymentProvider } from "@bomy/psp"

import { getActivePsp, readPaymentFlags } from "@/lib/active-psp"
import { paymentsEnabled, subscriptionPsp } from "@/lib/payments-enabled"

const withAdmin = dbModule.withAdmin as unknown as Mock

function rows(r: Array<{ key: string; value: unknown }>) {
  withAdmin.mockResolvedValueOnce(r)
}

function flags(active: unknown, subs: unknown) {
  rows([
    { key: "active_psp", value: active },
    { key: "subscriptions_enabled", value: subs },
  ])
}

const configuredStripe = { id: "stripe", isConfigured: () => true } as unknown as PaymentProvider

describe("readPaymentFlags / getActivePsp — fail closed", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it("reads both keys in ONE withAdmin call", async () => {
    flags("hitpay", true)
    await expect(readPaymentFlags()).resolves.toEqual({
      activePsp: "hitpay",
      subscriptionsEnabled: true,
    })
    expect(withAdmin).toHaveBeenCalledTimes(1)
  })

  it("accepts 'stripe' as a known provider id", async () => {
    flags("stripe", false)
    await expect(getActivePsp()).resolves.toBe("stripe")
  })

  it.each([
    ["unknown provider string", "paypal"],
    ["wrong case", "HitPay"],
    ["number", 1],
    ["null", null],
    ["object", { provider: "hitpay" }],
    ["array", ["hitpay"]],
  ])("active_psp = %s → null", async (_label, value) => {
    flags(value, true)
    await expect(getActivePsp()).resolves.toBeNull()
  })

  it.each([
    ["string 'true'", "true"],
    ["number 1", 1],
    ["null", null],
    ["false", false],
  ])("subscriptions_enabled = %s → false (only JSON true opens)", async (_label, value) => {
    flags("hitpay", value)
    expect((await readPaymentFlags()).subscriptionsEnabled).toBe(false)
  })

  it("missing rows → { activePsp: null, subscriptionsEnabled: false }", async () => {
    rows([])
    await expect(readPaymentFlags()).resolves.toEqual({
      activePsp: null,
      subscriptionsEnabled: false,
    })
  })

  it("DB error → closed, never throws", async () => {
    withAdmin.mockRejectedValueOnce(new Error("connection refused"))
    await expect(readPaymentFlags()).resolves.toEqual({
      activePsp: null,
      subscriptionsEnabled: false,
    })
  })
})

describe("paymentsEnabled / subscriptionPsp — active × configured × subscriptions_enabled", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    resetProviders()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it("open: subscriptions_enabled=true, active=hitpay, HitPay configured → 'hitpay'", async () => {
    flags("hitpay", true)
    await expect(subscriptionPsp()).resolves.toBe("hitpay")
    flags("hitpay", true)
    await expect(paymentsEnabled()).resolves.toBe(true)
  })

  it("closed: subscriptions_enabled=false even with HitPay configured (prod default)", async () => {
    flags("hitpay", false)
    await expect(paymentsEnabled()).resolves.toBe(false)
  })

  it.each([
    ["HITPAY_API_KEY unset", "HITPAY_API_KEY"],
    ["HITPAY_API_URL unset", "HITPAY_API_URL"],
  ])("closed: active=hitpay but %s (legacy env sniff preserved)", async (_l, envKey) => {
    delete process.env[envKey]
    flags("hitpay", true)
    await expect(paymentsEnabled()).resolves.toBe(false)
  })

  it("closed: active=stripe → the PR 3 placeholder is never configured", async () => {
    flags("stripe", true)
    await expect(paymentsEnabled()).resolves.toBe(false)
  })

  it("open on stripe only when the stripe provider reports configured (PR 4 shape)", async () => {
    setProviderOverride("stripe", configuredStripe)
    flags("stripe", true)
    await expect(subscriptionPsp()).resolves.toBe("stripe")
  })

  it("closed: active_psp unknown/missing", async () => {
    flags("paypal", true)
    await expect(paymentsEnabled()).resolves.toBe(false)
    rows([{ key: "subscriptions_enabled", value: true }])
    await expect(paymentsEnabled()).resolves.toBe(false)
  })

  it("closed: DB error", async () => {
    withAdmin.mockRejectedValueOnce(new Error("boom"))
    await expect(paymentsEnabled()).resolves.toBe(false)
  })

  it("closed: the provider lookup itself throws", async () => {
    const throwing = {
      id: "hitpay",
      isConfigured: () => {
        throw new Error("bad env")
      },
    } as unknown as PaymentProvider
    setProviderOverride("hitpay", throwing)
    flags("hitpay", true)
    await expect(paymentsEnabled()).resolves.toBe(false)
  })
})
