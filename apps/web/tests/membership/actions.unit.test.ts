/**
 * Unit tests — joinMembership compensation path
 *
 * Fully mocked — no DB required. Covers the DB-correlation-failure branch
 * that cannot be exercised through the live-DB integration tests.
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
import { joinMembership } from "../../src/app/(marketing)/membership/actions"

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

describe("joinMembership — DB correlation failure compensation", () => {
  beforeEach(() => {
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    process.env["APP_URL"] = "http://localhost:3000"
    ;(auth as unknown as Mock).mockResolvedValue({
      user: { id: USER_ID, role: "buyer", email: "t@test.bomy" },
    })
    // No existing subscription — bypass both active/pending guards.
    ;(dbModule.withTenant as unknown as Mock).mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("DB correlation failure + cancel succeeds: cancels live billing and removes pending row", async () => {
    const cancelRecurringBilling = vi.fn().mockResolvedValue(undefined)
    const createRecurringBilling = vi.fn().mockResolvedValue({
      id: "rec-abc",
      url: "https://securecheckout.hit-pay.com/rec-abc",
    })
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({
      createRecurringBilling,
      cancelRecurringBilling,
    }))

    // withAdmin call order inside joinMembership:
    //   1 — read platform price
    //   2 — insert pending row
    //   3 — store hitpayRecurringId  ← we inject a failure here
    //   4 — delete pending row after successful cancel
    let callCount = 0
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return 7500n
      if (callCount === 2) return undefined
      if (callCount === 3) throw new Error("DB write failed — simulated")
      if (callCount === 4) return undefined
    })

    await expect(joinMembership()).rejects.toThrow("DB write failed — simulated")

    // Live billing must be cancelled.
    expect(cancelRecurringBilling).toHaveBeenCalledWith("rec-abc")
    // Pending row must be cleaned up (4th withAdmin call = delete).
    expect(mockWithAdmin).toHaveBeenCalledTimes(4)
  })

  it("DB correlation failure + cancel also fails: preserves pending row for reconciliation", async () => {
    const cancelRecurringBilling = vi.fn().mockRejectedValue(new Error("HitPay cancel unavailable"))
    const createRecurringBilling = vi.fn().mockResolvedValue({
      id: "rec-xyz",
      url: "https://securecheckout.hit-pay.com/rec-xyz",
    })
    ;(HitPayClient as unknown as Mock).mockImplementation(() => ({
      createRecurringBilling,
      cancelRecurringBilling,
    }))

    // withAdmin call order:
    //   1 — read platform price
    //   2 — insert pending row
    //   3 — store hitpayRecurringId  ← fail
    //   4 — write hitpayRecurringId as reconciliation fallback  ← succeed
    // (no 5th call — row is NOT deleted when cancel fails)
    let callCount = 0
    const mockWithAdmin = dbModule.withAdmin as unknown as Mock
    mockWithAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return 7500n
      if (callCount === 2) return undefined
      if (callCount === 3) throw new Error("DB write failed — simulated")
      if (callCount === 4) return undefined // reconciliation write succeeds
    })

    await expect(joinMembership()).rejects.toThrow("DB write failed — simulated")

    expect(cancelRecurringBilling).toHaveBeenCalledWith("rec-xyz")
    // 4 calls: price + insert + fail + reconciliation write; NO delete call.
    expect(mockWithAdmin).toHaveBeenCalledTimes(4)
  })
})

describe("joinMembership — payments disabled guard (PR #39)", () => {
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
    await expect(joinMembership()).rejects.toThrow("NOT_FOUND")
    // Guard must run BEFORE any other work — proves the short-circuit fired
    // and not e.g. a missing-DATABASE_URL error or some downstream notFound.
    expect(auth).not.toHaveBeenCalled()
    expect(dbModule.withAdmin).not.toHaveBeenCalled()
    expect(dbModule.withTenant).not.toHaveBeenCalled()
    expect(HitPayClient).not.toHaveBeenCalled()
  })
})
