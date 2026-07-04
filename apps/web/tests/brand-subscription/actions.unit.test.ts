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
  withPublicRead: vi.fn(),
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
    // Plan + store read (no auth, public catalog lookup).
    ;(dbModule.withPublicRead as unknown as Mock).mockResolvedValue({
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
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("HitPay error (never called): deletes pending row so user can retry", async () => {
    const createPaymentRequest = vi.fn().mockRejectedValue(new Error("HitPay unreachable"))
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({ createPaymentRequest }))

    // withPublicRead: read plan+store (set in beforeEach)
    // withAdmin call order:
    //   1 — insert pending row
    //   2 — (HitPay throws before store call) delete pending row cleanup
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockResolvedValue(undefined) // insert + delete

    await expect(subscribeToBrand(PLAN_ID)).rejects.toThrow("HitPay unreachable")

    // pending row cleanup must be called (2nd withAdmin = delete)
    expect(mockWithAdmin).toHaveBeenCalledTimes(2)
  })

  it("DB correlation write fails: tries fallback write, then deletes row on double failure", async () => {
    const createPaymentRequest = vi.fn().mockResolvedValue({
      id: "pr-abc123",
      url: "https://securecheckout.hit-pay.com/pr-abc123",
    })
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({ createPaymentRequest }))

    // withPublicRead: read plan+store (set in beforeEach)
    // withAdmin call order:
    //   1 — insert pending row
    //   2 — store hitpay_payment_request_id ← throw
    //   3 — fallback write ← throw
    //   4 — delete orphan row
    let callCount = 0
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return undefined // insert
      if (callCount === 2) throw new Error("DB write failed — primary")
      if (callCount === 3) throw new Error("DB write failed — fallback")
      return undefined // delete
    })

    await expect(subscribeToBrand(PLAN_ID)).rejects.toThrow("DB write failed — primary")

    // 4 calls: insert + primary fail + fallback fail + delete
    expect(mockWithAdmin).toHaveBeenCalledTimes(4)
  })

  it("DB correlation write fails: fallback succeeds → redirects to checkout, does NOT delete row", async () => {
    const createPaymentRequest = vi.fn().mockResolvedValue({
      id: "pr-xyz789",
      url: "https://securecheckout.hit-pay.com/pr-xyz789",
    })
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({ createPaymentRequest }))

    // withPublicRead: read plan+store (set in beforeEach)
    // withAdmin call order:
    //   1 — insert pending row
    //   2 — store hitpay_payment_request_id ← throw
    //   3 — fallback write ← succeed → redirect to paymentRequest.url
    // (no 4th call — row is NOT deleted; redirect throws before throw err is reached)
    let callCount = 0
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return undefined // insert
      if (callCount === 2) throw new Error("DB write failed — primary")
      return undefined // fallback write succeeds
    })

    // Fallback saved → redirect throws (not the original DB error)
    const err = await subscribeToBrand(PLAN_ID).catch((e: Error) => e)
    expect((err as Error).message).toBe("REDIRECT:https://securecheckout.hit-pay.com/pr-xyz789")

    // 3 calls: insert + primary fail + fallback succeed; NO delete
    expect(mockWithAdmin).toHaveBeenCalledTimes(3)
  })
})

describe("subscribeToBrand — payments disabled guard (PR #39)", () => {
  beforeEach(() => {
    // Explicitly UNSET — overriding the outer compensation-suite beforeEach
    // which sets them. The guard is meant to short-circuit when these are absent.
    delete process.env["HITPAY_API_KEY"]
    delete process.env["HITPAY_API_URL"]
    process.env["APP_URL"] = "http://localhost:3000"
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("calls notFound() and never reaches auth/DB/HitPayClient when payments are disabled", async () => {
    await expect(subscribeToBrand(PLAN_ID)).rejects.toThrow("NOT_FOUND")
    // Guard must run BEFORE any other work — proves the short-circuit fired
    // and not the existing notFound() for missing planData.
    expect(auth).not.toHaveBeenCalled()
    expect(dbModule.withAdmin).not.toHaveBeenCalled()
    expect(dbModule.withPublicRead).not.toHaveBeenCalled()
    expect(dbModule.withTenant).not.toHaveBeenCalled()
    expect(HitPayClient).not.toHaveBeenCalled()
  })
})
