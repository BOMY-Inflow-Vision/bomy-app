/**
 * Integration tests — admin vouchers server actions
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/flash-toast-server", () => ({ flashToast: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

import { auth } from "@/auth"
import { flashToast } from "@/lib/flash-toast-server"
import { createVoucher } from "../../src/app/vouchers/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const mockFlashToast = flashToast as unknown as Mock

describe.skipIf(!shouldRun)("createVoucher", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let userId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    userId = randomUUID()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
        { id: userId, email: `${userId}@test.bomy`, role: "buyer" },
      ])
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, userId))
    })
    await testDb.close()
  })

  it("creates a fixed_myr voucher for the given user email, flashes success, redirects", async () => {
    mockFlashToast.mockClear()
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    const formData = new FormData()
    formData.set("userEmail", `${userId}@test.bomy`)
    formData.set("code", `COMP-${userId.slice(0, 8).toUpperCase()}`)
    formData.set("fixedAmountMyr", "10.00")
    formData.set("issuedMonth", "2026-05")
    formData.set("expiresAt", "2026-08-01")

    // createVoucher redirects on success — next/navigation's redirect is mocked to throw so
    // the call is observable in a test (Next.js itself implements redirect() this way too).
    await expect(createVoucher(null, formData)).rejects.toThrow("REDIRECT:/vouchers")

    const rows = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.userId, userId)),
    )
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.type).toBe("fixed_myr")
    expect(row.fixedAmountSen).toBe(1000n)
    expect(row.issuedMonth).toBe("2026-05")
    expect(row.code).toBe(`COMP-${userId.slice(0, 8).toUpperCase()}`)
    expect(mockFlashToast).toHaveBeenCalledWith("success", "Voucher created.")
  })

  it("returns a typed error when user email not found, no throw, no redirect", async () => {
    mockFlashToast.mockClear()
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    const formData = new FormData()
    formData.set("userEmail", "nobody@nowhere.invalid")
    formData.set("code", "NOTFOUND-01")
    formData.set("fixedAmountMyr", "5.00")
    formData.set("issuedMonth", "2026-05")
    formData.set("expiresAt", "2026-08-01")

    const result = await createVoucher(null, formData)
    expect(result).toEqual({
      ok: false,
      error: "No user found with email: nobody@nowhere.invalid",
    })
    expect(mockFlashToast).not.toHaveBeenCalled()
  })

  it("a demoted admin gets a typed error, no throw, no voucher created", async () => {
    mockFlashToast.mockClear()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "buyer" } })

    const formData = new FormData()
    formData.set("userEmail", `${userId}@test.bomy`)
    formData.set("code", "DEMOTED-01")
    formData.set("fixedAmountMyr", "5.00")
    formData.set("issuedMonth", "2026-06")
    formData.set("expiresAt", "2026-08-01")

    const result = await createVoucher(null, formData)
    expect(result).toEqual({ ok: false, error: "You don't have permission to do that." })

    const rows = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.code, "DEMOTED-01")),
    )
    expect(rows).toHaveLength(0)
  })
})
