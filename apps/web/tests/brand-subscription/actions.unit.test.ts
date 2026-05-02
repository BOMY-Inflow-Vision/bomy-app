/**
 * Unit tests — subscribeToBrand compensation paths
 *
 * Fully mocked — no DB required. Covers DB-correlation-failure branches
 * that are impractical to exercise through live-DB integration tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NOT_FOUND"), { name: "NotFoundError" })
  }),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("@bomy/hitpay", () => ({ HitPayClient: vi.fn() }))

vi.mock("@bomy/db", () => ({
  makeDb: vi.fn().mockReturnValue({ db: {}, close: vi.fn() }),
  schema: {},
  withAdmin: vi.fn(),
  withTenant: vi.fn(),
}))

import { auth } from "@/auth"
import { HitPayClient } from "@bomy/hitpay"
import * as dbModule from "@bomy/db"
import { subscribeToBrand } from "../../src/app/brands/[slug]/subscribe/actions"

const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const PLAN_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
const STORE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"

describe("subscribeToBrand — DB correlation failure compensation", () => {
  beforeEach(() => {
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    process.env["APP_URL"] = "http://localhost:3000"
    ;(auth as unknown as Mock).mockResolvedValue({
      user: { id: USER_ID, role: "buyer", email: "t@test.bomy" },
    })
    // No existing subscription — bypass guard.
    ;(dbModule.withTenant as unknown as Mock).mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("HitPay error (never called): deletes pending row so user can retry", async () => {
    const createPaymentRequest = vi.fn().mockRejectedValue(new Error("HitPay unreachable"))
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({ createPaymentRequest }))

    // withAdmin call order:
    //   1 — read plan+store
    //   2 — insert pending row
    //   3 — (HitPay throws before store call) delete pending row cleanup
    let callCount = 0
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          plan: {
            id: PLAN_ID,
            storeId: STORE_ID,
            termMonths: 3,
            priceMyrSen: 5000n,
            discountPct: 5,
            description: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          store: { id: STORE_ID, name: "Test Brand", slug: "test-brand", status: "active" },
        }
      }
      return undefined // insert, delete
    })

    await expect(subscribeToBrand(PLAN_ID)).rejects.toThrow("HitPay unreachable")

    // pending row cleanup must be called (3rd withAdmin = delete)
    expect(mockWithAdmin).toHaveBeenCalledTimes(3)
  })

  it("DB correlation write fails: tries fallback write, then deletes row on double failure", async () => {
    const createPaymentRequest = vi.fn().mockResolvedValue({
      id: "pr-abc123",
      url: "https://securecheckout.hit-pay.com/pr-abc123",
    })
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({ createPaymentRequest }))

    // withAdmin call order:
    //   1 — read plan+store
    //   2 — insert pending row
    //   3 — store hitpay_payment_request_id ← throw
    //   4 — fallback write ← throw
    //   5 — delete orphan row
    let callCount = 0
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          plan: {
            id: PLAN_ID,
            storeId: STORE_ID,
            termMonths: 3,
            priceMyrSen: 5000n,
            discountPct: 5,
            description: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          store: { id: STORE_ID, name: "Test Brand", slug: "test-brand", status: "active" },
        }
      }
      if (callCount === 2) return undefined // insert
      if (callCount === 3) throw new Error("DB write failed — primary")
      if (callCount === 4) throw new Error("DB write failed — fallback")
      return undefined // delete
    })

    await expect(subscribeToBrand(PLAN_ID)).rejects.toThrow("DB write failed — primary")

    // 5 calls: plan read + insert + primary fail + fallback fail + delete
    expect(mockWithAdmin).toHaveBeenCalledTimes(5)
  })

  it("DB correlation write fails: fallback succeeds → redirects to checkout, does NOT delete row", async () => {
    const createPaymentRequest = vi.fn().mockResolvedValue({
      id: "pr-xyz789",
      url: "https://securecheckout.hit-pay.com/pr-xyz789",
    })
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({ createPaymentRequest }))

    // withAdmin call order:
    //   1 — read plan+store
    //   2 — insert pending row
    //   3 — store hitpay_payment_request_id ← throw
    //   4 — fallback write ← succeed → redirect to paymentRequest.url
    // (no 5th call — row is NOT deleted; redirect throws before throw err is reached)
    let callCount = 0
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          plan: {
            id: PLAN_ID,
            storeId: STORE_ID,
            termMonths: 3,
            priceMyrSen: 5000n,
            discountPct: 5,
            description: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          store: { id: STORE_ID, name: "Test Brand", slug: "test-brand", status: "active" },
        }
      }
      if (callCount === 2) return undefined // insert
      if (callCount === 3) throw new Error("DB write failed — primary")
      return undefined // fallback write succeeds
    })

    // Fallback saved → redirect throws (not the original DB error)
    const err = await subscribeToBrand(PLAN_ID).catch((e: Error) => e)
    expect((err as Error).message).toBe("REDIRECT:https://securecheckout.hit-pay.com/pr-xyz789")

    // 4 calls: plan read + insert + primary fail + fallback succeed; NO delete
    expect(mockWithAdmin).toHaveBeenCalledTimes(4)
  })
})
