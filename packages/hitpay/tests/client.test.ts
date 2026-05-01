import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HitPayClient } from "../src/client.js"
import {
  HitPayAuthError,
  HitPayError,
  HitPayNotFoundError,
  HitPayRateLimitError,
  HitPayValidationError,
} from "../src/errors.js"

const BASE_URL = "https://api.sandbox.hit-pay.com"
const API_KEY = "test-api-key"
const SALT_KEY = "test-salt-key"

function makeClient() {
  return new HitPayClient({ apiKey: API_KEY, saltKey: SALT_KEY, baseUrl: BASE_URL })
}

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

describe("HitPayClient", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("createPaymentRequest", () => {
    const input = {
      amount: "100.00",
      currency: "MYR" as const,
      email: "buyer@example.com",
      purpose: "Brand subscription",
      redirect_url: "https://bomy.my/brands/test/subscribe/success",
    }

    it("posts to /v1/payment-requests with correct headers and returns response", async () => {
      const mockResponse = {
        id: "pr_123",
        url: "https://securecheckout.hit-pay.com/payment-link/pr_123",
        status: "active",
        amount: "100.00",
        currency: "MYR",
        email: "buyer@example.com",
        name: null,
        purpose: "Brand subscription",
        reference_number: null,
        payment_methods: ["card"],
        redirect_url: "https://bomy.my/brands/test/subscribe/success",
        webhook: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      }
      const spy = mockFetch(200, mockResponse)
      const client = makeClient()

      const result = await client.createPaymentRequest(input)

      expect(spy).toHaveBeenCalledOnce()
      const [url, init] = spy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/v1/payment-requests`)
      expect((init.headers as Record<string, string>)["X-BUSINESS-API-KEY"]).toBe(API_KEY)
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
      expect(init.method).toBe("POST")
      expect(result.id).toBe("pr_123")
      expect(result.status).toBe("active")
    })
  })

  describe("createRecurringBilling", () => {
    const input = {
      plan: {
        amount: "75.00",
        currency: "MYR" as const,
        name: "BOMY Platform Membership",
        cycle: "yearly" as const,
      },
      customer: { email: "member@example.com", name: "Ali Hassan" },
    }

    it("posts to /v1/recurring-billing and returns response", async () => {
      const mockResponse = {
        id: "rb_456",
        name: "BOMY Platform Membership",
        description: null,
        cycle: "yearly",
        status: "scheduled",
        amount: "75.00",
        currency: "MYR",
        reference: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      }
      const spy = mockFetch(200, mockResponse)
      const client = makeClient()

      const result = await client.createRecurringBilling(input)

      expect(spy).toHaveBeenCalledOnce()
      const [url] = spy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/v1/recurring-billing`)
      expect(result.id).toBe("rb_456")
      expect(result.cycle).toBe("yearly")
    })
  })

  describe("cancelRecurringBilling", () => {
    it("sends DELETE to /v1/recurring-billing/{id} on 200", async () => {
      const spy = mockFetch(200, { deleted: true })
      const client = makeClient()

      await expect(client.cancelRecurringBilling("rb_456")).resolves.toBeUndefined()
      const [url, init] = spy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/v1/recurring-billing/rb_456`)
      expect(init.method).toBe("DELETE")
    })

    it("sends DELETE and handles 204 No Content", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = makeClient()
      await expect(client.cancelRecurringBilling("rb_789")).resolves.toBeUndefined()
    })
  })

  describe("createRefund", () => {
    it("posts to /v1/refund and returns refund response", async () => {
      const mockResponse = {
        id: "ref_001",
        payment_id: "pay_abc",
        amount_refunded: "50.00",
        payment_method: "card",
        status: "succeeded",
        created_at: "2026-05-01T00:00:00Z",
      }
      const spy = mockFetch(200, mockResponse)
      const client = makeClient()

      const result = await client.createRefund({ payment_id: "pay_abc", amount: "50.00" })

      const [url] = spy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/v1/refund`)
      expect(result.id).toBe("ref_001")
      expect(result.status).toBe("succeeded")
    })
  })

  describe("createTransfer", () => {
    it("posts to /v1/transfers and returns transfer response", async () => {
      const input = {
        currency: "MYR" as const,
        transfers: [
          {
            bank_account_name: "Sari Craft Sdn Bhd",
            bank_account_number: "1234567890",
            bank_code: "MAYBANK",
            amount: "87.30",
            purpose: "Brand subscription payout",
          },
        ],
      }
      const mockResponse = {
        id: "tr_999",
        currency: "MYR",
        status: "pending",
        transfers: [{ ...input.transfers[0], status: "pending" }],
        created_at: "2026-05-01T00:00:00Z",
      }
      const spy = mockFetch(200, mockResponse)
      const client = makeClient()

      const result = await client.createTransfer(input)

      const [url] = spy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/v1/transfers`)
      expect(result.id).toBe("tr_999")
      expect(result.status).toBe("pending")
    })
  })

  describe("error mapping", () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    const client = makeClient()
    const dummyInput = {
      amount: "100.00",
      currency: "MYR" as const,
      email: "x@x.com",
      purpose: "test",
      redirect_url: "https://bomy.my",
    }

    it("throws HitPayAuthError on 401", async () => {
      mockFetch(401, { message: "Unauthorized" })
      await expect(client.createPaymentRequest(dummyInput)).rejects.toBeInstanceOf(HitPayAuthError)
    })

    it("throws HitPayNotFoundError on 404", async () => {
      mockFetch(404, { message: "Not found" })
      await expect(client.cancelRecurringBilling("missing")).rejects.toBeInstanceOf(
        HitPayNotFoundError,
      )
    })

    it("throws HitPayValidationError on 422", async () => {
      mockFetch(422, { message: "amount is required" })
      await expect(client.createPaymentRequest(dummyInput)).rejects.toBeInstanceOf(
        HitPayValidationError,
      )
    })

    it("throws HitPayRateLimitError on 429", async () => {
      mockFetch(429, { message: "Too many requests" })
      await expect(client.createPaymentRequest(dummyInput)).rejects.toBeInstanceOf(
        HitPayRateLimitError,
      )
    })

    it("throws generic HitPayError on 500", async () => {
      mockFetch(500, { message: "Internal server error" })
      const err = await client.createPaymentRequest(dummyInput).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(HitPayError)
      expect((err as HitPayError).statusCode).toBe(500)
    })

    it("exposes statusCode and body on all errors", async () => {
      mockFetch(422, { errors: { amount: ["is invalid"] } })
      const err = await client.createPaymentRequest(dummyInput).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(HitPayValidationError)
      expect((err as HitPayError).statusCode).toBe(422)
      expect((err as HitPayError).body).toEqual({ errors: { amount: ["is invalid"] } })
    })
  })
})
