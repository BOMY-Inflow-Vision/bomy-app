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

  it("invalid term (4) → throws", async () => {
    await expect(
      createPlan(makeFormData({ termMonths: "4", priceMyrSen: "50.00", discountPct: "5" })),
    ).rejects.toThrow("Term must be 3, 6, or 12 months")
  })

  it("invalid price format → throws", async () => {
    await expect(
      createPlan(makeFormData({ termMonths: "3", priceMyrSen: "abc", discountPct: "5" })),
    ).rejects.toThrow('Invalid amount: "abc"')
  })

  it("zero price → throws", async () => {
    await expect(
      createPlan(makeFormData({ termMonths: "3", priceMyrSen: "0", discountPct: "5" })),
    ).rejects.toThrow("Price must be greater than zero")
  })

  it("discount too low (4) → throws", async () => {
    await expect(
      createPlan(makeFormData({ termMonths: "3", priceMyrSen: "50.00", discountPct: "4" })),
    ).rejects.toThrow("Discount must be between 5% and 10%")
  })

  it("discount too high (11) → throws", async () => {
    await expect(
      createPlan(makeFormData({ termMonths: "3", priceMyrSen: "50.00", discountPct: "11" })),
    ).rejects.toThrow("Discount must be between 5% and 10%")
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

  it("invalid price format → throws", async () => {
    await expect(
      updatePlan(PLAN_ID, makeFormData({ priceMyrSen: "bad", discountPct: "5" })),
    ).rejects.toThrow('Invalid amount: "bad"')
  })

  it("discount out of range → throws", async () => {
    await expect(
      updatePlan(PLAN_ID, makeFormData({ priceMyrSen: "50.00", discountPct: "3" })),
    ).rejects.toThrow("Discount must be between 5% and 10%")
  })

  it("plan not updated (0 rows returned) → throws not-authorized error", async () => {
    ;(dbModule.withTenant as unknown as Mock).mockResolvedValue([])
    await expect(
      updatePlan(PLAN_ID, makeFormData({ priceMyrSen: "50.00", discountPct: "5" })),
    ).rejects.toThrow("Plan not found or not authorized")
  })
})
