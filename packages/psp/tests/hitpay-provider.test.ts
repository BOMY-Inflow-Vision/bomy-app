/**
 * HitPayProvider — the adapter must send EXACTLY the HitPay request bodies the app built
 * inline before packages/psp existed (Stripe design PR 2 is behaviour-neutral). Bodies are
 * compared with toEqual, so an added or dropped key fails the test.
 *
 * No real HTTP: fetch is mocked, as in packages/hitpay/tests.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PspRequestError,
  PspUnsupportedError,
  isPspRejection,
  isPspRequestError,
  pspErrorCode,
} from "../src/errors.js"
import { HitPayProvider } from "../src/hitpay/provider.js"

const BASE_URL = "https://api.sandbox.hit-pay.com"
const ENV = { HITPAY_API_KEY: "test-api-key", HITPAY_API_URL: BASE_URL }

function provider(env: Record<string, string | undefined> = ENV) {
  return new HitPayProvider({ env })
}

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function sent(spy: ReturnType<typeof mockFetch>): {
  url: string
  method: string | undefined
  body: Record<string, unknown> | null
} {
  const [url, init] = spy.mock.calls[0] as [string, RequestInit]
  return {
    url,
    method: init.method,
    body: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("HitPayProvider.isConfigured", () => {
  it("true only when both HITPAY_API_KEY and HITPAY_API_URL are set", () => {
    expect(provider().isConfigured()).toBe(true)
    expect(provider({ HITPAY_API_KEY: "k" }).isConfigured()).toBe(false)
    expect(provider({ HITPAY_API_URL: BASE_URL }).isConfigured()).toBe(false)
    expect(provider({ HITPAY_API_KEY: "", HITPAY_API_URL: BASE_URL }).isConfigured()).toBe(false)
    expect(provider({}).isConfigured()).toBe(false)
  })

  it("reads env on every call (no caching)", () => {
    const env: Record<string, string | undefined> = {}
    const p = provider(env)
    expect(p.isConfigured()).toBe(false)
    env["HITPAY_API_KEY"] = "k"
    env["HITPAY_API_URL"] = BASE_URL
    expect(p.isConfigured()).toBe(true)
  })
})

describe("HitPayProvider.createOneTimeCheckout", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111"

  it("order: same body as checkout/actions.ts initiateCheckout", async () => {
    const spy = mockFetch(200, { id: "pr_order", url: "https://hitpay.test/pr_order" })
    const res = await provider().createOneTimeCheckout({
      kind: "order",
      bomyRefId: sessionId,
      amountSen: 12345n,
      currency: "MYR",
      customerEmail: "buyer@example.com",
      description: `BOMY order #${sessionId.slice(0, 8)}`,
      successUrl: `https://web.test/checkout/success?session=${sessionId}`,
      cancelUrl: `https://web.test/checkout/cancelled?session=${sessionId}`,
      webhookUrl: "https://api.test/webhooks/hitpay",
      idempotencyKey: `checkout:${sessionId}`,
    })

    expect(res).toEqual({ pspRequestId: "pr_order", redirectUrl: "https://hitpay.test/pr_order" })
    const req = sent(spy)
    expect(req.url).toBe(`${BASE_URL}/v1/payment-requests`)
    expect(req.method).toBe("POST")
    expect(req.body).toEqual({
      amount: "123.45",
      currency: "MYR",
      email: "buyer@example.com",
      purpose: "BOMY order #11111111",
      reference_number: sessionId,
      redirect_url: `https://web.test/checkout/success?session=${sessionId}`,
      cancel_url: `https://web.test/checkout/cancelled?session=${sessionId}`,
      webhook: "https://api.test/webhooks/hitpay",
    })
  })

  it("brand subscription: same body as subscribeToBrand (no cancel_url, no repeat payments)", async () => {
    const spy = mockFetch(200, { id: "pr_brand", url: "https://hitpay.test/pr_brand" })
    await provider().createOneTimeCheckout({
      kind: "brand_subscription",
      bomyRefId: "sub-1",
      amountSen: 50000n,
      currency: "MYR",
      customerEmail: "fan@example.com",
      description: "Acme Brand Subscription (3mo)",
      successUrl: "https://web.test/brands/acme/subscribe/success",
      webhookUrl: "https://api.test/webhooks/hitpay",
      idempotencyKey: "brand_sub:sub-1",
    })

    expect(sent(spy).body).toEqual({
      amount: "500.00",
      currency: "MYR",
      email: "fan@example.com",
      purpose: "Acme Brand Subscription (3mo)",
      redirect_url: "https://web.test/brands/acme/subscribe/success",
      reference_number: "sub-1",
      allow_repeated_payments: false,
      webhook: "https://api.test/webhooks/hitpay",
    })
  })

  it("omits webhook when no webhookUrl is given (HitPay dashboard default applies)", async () => {
    const spy = mockFetch(200, { id: "pr_x", url: "https://hitpay.test/pr_x" })
    await provider().createOneTimeCheckout({
      kind: "brand_subscription",
      bomyRefId: "sub-2",
      amountSen: 100n,
      currency: "MYR",
      customerEmail: "",
      description: "d",
      successUrl: "https://web.test/s",
      webhookUrl: undefined,
      idempotencyKey: "k",
    })
    expect(sent(spy).body).not.toHaveProperty("webhook")
    expect(sent(spy).body).not.toHaveProperty("cancel_url")
  })

  it("ignores expiresAt and idempotencyKey (not sent to HitPay)", async () => {
    const spy = mockFetch(200, { id: "pr_y", url: "https://hitpay.test/pr_y" })
    await provider().createOneTimeCheckout({
      kind: "order",
      bomyRefId: "s",
      amountSen: 100n,
      currency: "MYR",
      customerEmail: "e@x.test",
      description: "d",
      successUrl: "https://web.test/s",
      expiresAt: new Date("2026-11-25T00:00:00Z"),
      idempotencyKey: "k",
    })
    const body = sent(spy).body ?? {}
    expect(body).not.toHaveProperty("expiry_date")
    expect(Object.keys(body)).not.toContain("idempotency_key")
  })
})

describe("HitPayProvider.createRecurringCheckout", () => {
  it("same body as joinMembership; recurring id is the billing id", async () => {
    const spy = mockFetch(200, { id: "rb_1", url: "https://hitpay.test/rb_1" })
    const res = await provider().createRecurringCheckout({
      kind: "member_subscription",
      bomyRefId: "msub-1",
      amountSen: 7500n,
      currency: "MYR",
      interval: "year",
      customerEmail: "member@example.com",
      description: "BOMY Platform Membership",
      successUrl: "https://web.test/membership/success",
      // 2026-06-17T16:30Z is 2026-06-18 in SGT — HitPay's start_date zone.
      startDate: new Date("2026-06-17T16:30:00.000Z"),
      webhookUrl: "https://api.test/webhooks/hitpay",
      idempotencyKey: "membership:msub-1",
    })

    expect(res).toEqual({
      pspRequestId: "rb_1",
      pspRecurringId: "rb_1",
      redirectUrl: "https://hitpay.test/rb_1",
    })
    const req = sent(spy)
    expect(req.url).toBe(`${BASE_URL}/v1/recurring-billing`)
    expect(req.body).toEqual({
      amount: "75.00",
      currency: "MYR",
      name: "BOMY Platform Membership",
      cycle: "yearly",
      customer_email: "member@example.com",
      start_date: "2026-06-18",
      reference: "msub-1",
      redirect_url: "https://web.test/membership/success",
      webhook: "https://api.test/webhooks/hitpay",
    })
  })
})

describe("HitPayProvider.cancelRecurring", () => {
  it("DELETEs the recurring billing (atPeriodEnd is ignored)", async () => {
    const spy = mockFetch(200, { deleted: true })
    await expect(provider().cancelRecurring("rb_9", { atPeriodEnd: true })).resolves.toBeUndefined()
    const req = sent(spy)
    expect(req.url).toBe(`${BASE_URL}/v1/recurring-billing/rb_9`)
    expect(req.method).toBe("DELETE")
  })
})

describe("HitPayProvider.refund", () => {
  it("same body as refundDuplicateCharge; maps id + status", async () => {
    const spy = mockFetch(200, {
      id: "ref_1",
      payment_id: "pay_1",
      amount_refunded: "75.00",
      payment_method: "card",
      status: "pending",
      created_at: "2026-11-25T00:00:00Z",
    })
    const res = await provider().refund({
      pspPaymentId: "pay_1",
      amountSen: 7500n,
      reason: "Duplicate subscription charge",
      idempotencyKey: "dup_refund:x",
    })
    expect(res).toEqual({ pspRefundId: "ref_1", status: "pending" })
    const req = sent(spy)
    expect(req.url).toBe(`${BASE_URL}/v1/refund`)
    expect(req.body).toEqual({
      payment_id: "pay_1",
      amount: "75.00",
      reason: "Duplicate subscription charge",
    })
  })
})

describe("HitPayProvider — unsupported operations", () => {
  it("expireCheckout is 'unsupported' and makes no HTTP call", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
    await expect(provider().expireCheckout("pr_1")).resolves.toBe("unsupported")
    expect(spy).not.toHaveBeenCalled()
  })

  it("getPaymentFee rejects with PspUnsupportedError", async () => {
    await expect(provider().getPaymentFee("pay_1")).rejects.toBeInstanceOf(PspUnsupportedError)
  })
})

describe("HitPayProvider — errors", () => {
  const call = (p: HitPayProvider) =>
    p.createOneTimeCheckout({
      kind: "order",
      bomyRefId: "s",
      amountSen: 100n,
      currency: "MYR",
      customerEmail: "e@x.test",
      description: "d",
      successUrl: "https://web.test/s",
      idempotencyKey: "k",
    })

  it.each([
    [400, "error", "rejected"],
    [401, "auth", "rejected"],
    [404, "notfound", "rejected"],
    [422, "validation", "rejected"],
    [429, "ratelimit", "rejected"],
    [408, "error", "unknown"],
    [409, "error", "unknown"],
    [425, "error", "unknown"],
    [500, "error", "unknown"],
    [502, "error", "unknown"],
    [503, "error", "unknown"],
    [504, "error", "unknown"],
  ])("HTTP %i → PspRequestError code %s, outcome %s", async (status, code, outcome) => {
    mockFetch(status, { message: "nope" })
    const err: unknown = await call(provider()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PspRequestError)
    expect(isPspRequestError(err)).toBe(true)
    const e = err as PspRequestError
    expect(e.provider).toBe("hitpay")
    // The audit code is the legacy token whatever the outcome.
    expect(e.code).toBe(code)
    expect(pspErrorCode(err)).toBe(code)
    expect(e.statusCode).toBe(status)
    expect(e.body).toEqual({ message: "nope" })
    expect(e.outcome).toBe(outcome)
    expect(isPspRejection(err)).toBe(outcome === "rejected")
  })

  it("a network failure propagates unchanged (outcome unknown, not a PspRequestError)", async () => {
    const netErr = new TypeError("fetch failed")
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(netErr)
    const err: unknown = await call(provider()).catch((e: unknown) => e)
    expect(err).toBe(netErr)
    expect(isPspRequestError(err)).toBe(false)
    expect(isPspRejection(err)).toBe(false)
  })

  it("a timeout (AbortError) is never a rejection", async () => {
    const abort = new DOMException("The operation was aborted", "TimeoutError")
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abort)
    const err: unknown = await call(provider()).catch((e: unknown) => e)
    expect(err).toBe(abort)
    expect(isPspRejection(err)).toBe(false)
  })

  it("an unparseable 2xx body is never a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html>gateway</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    )
    const err: unknown = await call(provider()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(isPspRejection(err)).toBe(false)
  })

  it("a 2xx refund without an id → unknown-outcome invalid_response (money may have moved)", async () => {
    mockFetch(200, { status: "pending" })
    const err: unknown = await provider()
      .refund({ pspPaymentId: "p", amountSen: 100n, reason: "r", idempotencyKey: "k" })
      .catch((e: unknown) => e)
    expect(isPspRequestError(err)).toBe(true)
    expect((err as PspRequestError).code).toBe("invalid_response")
    expect((err as PspRequestError).outcome).toBe("unknown")
    expect(isPspRejection(err)).toBe(false)
  })

  // Bob #208 review: an id HitPay did return must never be discarded — the caller stores it.
  it("a 2xx checkout with an id but no url keeps the id and returns redirectUrl null", async () => {
    mockFetch(200, { id: "pr_1" })
    await expect(call(provider())).resolves.toEqual({ pspRequestId: "pr_1", redirectUrl: null })
  })

  it.each([[""], [null], [42]])(
    "a non-string/empty url (%j) is null, never 'undefined'",
    async (url) => {
      mockFetch(200, { id: "pr_2", url })
      const res = await call(provider())
      expect(res.redirectUrl).toBeNull()
      expect(res.pspRequestId).toBe("pr_2")
    },
  )

  it("a 2xx checkout with a url but no id → unknown-outcome invalid_response (nothing to keep)", async () => {
    mockFetch(200, { url: "https://hitpay.test/x" })
    const err: unknown = await call(provider()).catch((e: unknown) => e)
    expect((err as PspRequestError).code).toBe("invalid_response")
    expect(isPspRejection(err)).toBe(false)
  })

  const recurring = (p: HitPayProvider) =>
    p.createRecurringCheckout({
      kind: "member_subscription",
      bomyRefId: "m",
      amountSen: 7500n,
      currency: "MYR",
      interval: "year",
      customerEmail: "e@x.test",
      description: "d",
      successUrl: "https://web.test/s",
      startDate: new Date("2026-11-25T00:00:00Z"),
      idempotencyKey: "k",
    })

  it("a 2xx recurring billing with an id but no url keeps both ids, redirectUrl null", async () => {
    mockFetch(200, { id: "rb_1" })
    await expect(recurring(provider())).resolves.toEqual({
      pspRequestId: "rb_1",
      pspRecurringId: "rb_1",
      redirectUrl: null,
    })
  })

  it("a 2xx recurring billing with a url but no id → invalid_response", async () => {
    mockFetch(200, { url: "https://hitpay.test/rb" })
    const err: unknown = await recurring(provider()).catch((e: unknown) => e)
    expect((err as PspRequestError).code).toBe("invalid_response")
    expect(isPspRejection(err)).toBe(false)
  })

  it("missing env throws the legacy plain Error before any HTTP call", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
    await expect(call(provider({ HITPAY_API_URL: BASE_URL }))).rejects.toThrow(
      "HITPAY_API_KEY is required",
    )
    await expect(call(provider({ HITPAY_API_KEY: "k" }))).rejects.toThrow(
      "HITPAY_API_URL is required",
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it("rejects a negative amount before any HTTP call", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
    await expect(
      provider().refund({ pspPaymentId: "p", amountSen: -1n, reason: "r", idempotencyKey: "k" }),
    ).rejects.toThrow(/negative/)
    expect(spy).not.toHaveBeenCalled()
  })
})
