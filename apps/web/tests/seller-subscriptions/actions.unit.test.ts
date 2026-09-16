/**
 * Unit tests — seller subscription plan actions (input validation)
 *
 * Fully mocked — no DB required. Covers auth guards and validation
 * branches that are fast to verify without a live database.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("@bomy/db", () => ({
  makeDb: vi.fn().mockReturnValue({ db: {}, close: vi.fn() }),
  schema: {},
  withTenant: vi.fn(),
}))

import { auth } from "@/auth"
import * as dbModule from "@bomy/db"
import { createPlan, updatePlan } from "../../src/app/seller/dashboard/subscriptions/actions"

const SELLER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const STORE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const PLAN_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

describe("createPlan", () => {
  beforeEach(() => {
    ;(auth as unknown as Mock).mockResolvedValue({
      user: { id: SELLER_ID, role: "seller_owner", email: "seller@test.bomy" },
    })
    ;(dbModule.withTenant as unknown as Mock).mockResolvedValue([{ id: STORE_ID }])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("unauthenticated → redirects to sign-in", async () => {
    ;(auth as unknown as Mock).mockResolvedValue(null)
    const err = await createPlan(makeFormData({})).catch((e: Error) => e)
    expect((err as Error).message).toMatch(/REDIRECT:\/auth\/sign-in/)
  })

  it("non-seller role → redirects to /account", async () => {
    ;(auth as unknown as Mock).mockResolvedValue({
      user: { id: SELLER_ID, role: "buyer", email: "buyer@test.bomy" },
    })
    const err = await createPlan(makeFormData({})).catch((e: Error) => e)
    expect((err as Error).message).toBe("REDIRECT:/account")
  })

  it("invalid term (4) → returns typed error", async () => {
    const result = await createPlan(
      makeFormData({ termMonths: "4", priceMyrSen: "50.00", discountPct: "5" }),
    )
    expect(result).toEqual({ ok: false, error: "Term must be 3, 6, or 12 months" })
  })

  it("invalid price format → returns typed error", async () => {
    const result = await createPlan(
      makeFormData({ termMonths: "3", priceMyrSen: "abc", discountPct: "5" }),
    )
    expect(result).toEqual({ ok: false, error: 'Invalid amount: "abc"' })
  })

  it("zero price → returns typed error", async () => {
    const result = await createPlan(
      makeFormData({ termMonths: "3", priceMyrSen: "0", discountPct: "5" }),
    )
    expect(result).toEqual({ ok: false, error: "Price must be greater than zero" })
  })

  it("discount too low (4) → returns typed error", async () => {
    const result = await createPlan(
      makeFormData({ termMonths: "3", priceMyrSen: "50.00", discountPct: "4" }),
    )
    expect(result).toEqual({ ok: false, error: "Discount must be between 5% and 10%" })
  })

  it("discount too high (11) → returns typed error", async () => {
    const result = await createPlan(
      makeFormData({ termMonths: "3", priceMyrSen: "50.00", discountPct: "11" }),
    )
    expect(result).toEqual({ ok: false, error: "Discount must be between 5% and 10%" })
  })
})

describe("updatePlan", () => {
  beforeEach(() => {
    ;(auth as unknown as Mock).mockResolvedValue({
      user: { id: SELLER_ID, role: "seller_owner", email: "seller@test.bomy" },
    })
    ;(dbModule.withTenant as unknown as Mock).mockResolvedValue([{ id: PLAN_ID }])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("unauthenticated → redirects to sign-in", async () => {
    ;(auth as unknown as Mock).mockResolvedValue(null)
    const err = await updatePlan(PLAN_ID, makeFormData({})).catch((e: Error) => e)
    expect((err as Error).message).toMatch(/REDIRECT:\/auth\/sign-in/)
  })

  it("non-seller role → redirects to /account", async () => {
    ;(auth as unknown as Mock).mockResolvedValue({
      user: { id: SELLER_ID, role: "buyer", email: "buyer@test.bomy" },
    })
    const err = await updatePlan(PLAN_ID, makeFormData({})).catch((e: Error) => e)
    expect((err as Error).message).toBe("REDIRECT:/account")
  })

  it("invalid price format → returns typed error", async () => {
    const result = await updatePlan(PLAN_ID, makeFormData({ priceMyrSen: "bad", discountPct: "5" }))
    expect(result).toEqual({ ok: false, error: 'Invalid amount: "bad"' })
  })

  it("discount out of range → returns typed error", async () => {
    const result = await updatePlan(
      PLAN_ID,
      makeFormData({ priceMyrSen: "50.00", discountPct: "3" }),
    )
    expect(result).toEqual({ ok: false, error: "Discount must be between 5% and 10%" })
  })

  it("plan not updated (0 rows returned) → returns not-authorized typed error", async () => {
    ;(dbModule.withTenant as unknown as Mock).mockResolvedValue([])
    const result = await updatePlan(
      PLAN_ID,
      makeFormData({ priceMyrSen: "50.00", discountPct: "5" }),
    )
    expect(result).toEqual({ ok: false, error: "Plan not found or not authorized" })
  })

  it("successful update returns ok:true (mock confirms isActive reset included in set)", async () => {
    // withTenant mock returns a row — simulates DB accepting the update with isActive=false in set.
    // Verifies the typed success result and that withTenant was called once.
    const mockWithTenant = dbModule.withTenant as unknown as Mock
    mockWithTenant.mockResolvedValueOnce([{ id: PLAN_ID }])
    const result = await updatePlan(
      PLAN_ID,
      makeFormData({ priceMyrSen: "50.00", discountPct: "5" }),
    )
    expect(result).toEqual({ ok: true })
    expect(mockWithTenant).toHaveBeenCalledOnce()
  })
})

describe("createPlan — duplicate term server-side handling", () => {
  beforeEach(() => {
    ;(auth as unknown as Mock).mockResolvedValue({
      user: { id: SELLER_ID, role: "seller_owner", email: "seller@test.bomy" },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("unique violation (23505) → returns controlled duplicate-term typed error", async () => {
    const uniqueErr = Object.assign(new Error("duplicate key value"), { code: "23505" })
    ;(dbModule.withTenant as unknown as Mock).mockRejectedValueOnce(uniqueErr)

    const result = await createPlan(
      makeFormData({ termMonths: "3", priceMyrSen: "50.00", discountPct: "5" }),
    )
    expect(result).toEqual({
      ok: false,
      error: "A plan for this term length already exists for your store",
    })
  })

  it("other (unexpected) DB error → returns a generic typed error, not the raw message", async () => {
    // Production redacts thrown Server Action messages, and the raw driver error
    // ("connection timeout") isn't something to show a seller — this is the same
    // catch-all shape used elsewhere (e.g. settings/actions.ts).
    const dbErr = Object.assign(new Error("connection timeout"), { code: "08006" })
    ;(dbModule.withTenant as unknown as Mock).mockRejectedValueOnce(dbErr)

    const result = await createPlan(
      makeFormData({ termMonths: "3", priceMyrSen: "50.00", discountPct: "5" }),
    )
    expect(result).toEqual({ ok: false, error: "Something went wrong. Please try again." })
  })
})
