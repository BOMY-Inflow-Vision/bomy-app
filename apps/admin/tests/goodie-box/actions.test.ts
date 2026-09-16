/**
 * Integration tests — admin goodie-box server actions
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/flash-toast-server", () => ({ flashToast: vi.fn() }))

import { auth } from "@/auth"
import { flashToast } from "@/lib/flash-toast-server"
import { markDispatched } from "../../src/app/goodie-box/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const mockFlashToast = flashToast as unknown as Mock

describe.skipIf(!shouldRun)("markDispatched", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let userId: string
  let dispatchId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    userId = randomUUID()
    dispatchId = randomUUID()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
        { id: userId, email: `${userId}@test.bomy`, role: "buyer" },
      ])
      await tx.insert(schema.goodieBoxDispatches).values({
        id: dispatchId,
        userId,
        quarter: "2026-Q2",
        status: "pending",
        shippingName: "Test Buyer",
        shippingAddress: { line1: "1 Jalan Test", city: "KL", postcode: "50000", state: "WP" },
      })
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.goodieBoxDispatches)
        .where(eq(schema.goodieBoxDispatches.id, dispatchId))
    })
    await testDb.close()
  })

  it("marks a pending dispatch as dispatched with a tracking number, flashes success", async () => {
    mockFlashToast.mockClear()
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    const formData = new FormData()
    formData.set("trackingNumber", "EE123456789MY")

    await markDispatched(dispatchId, formData)

    const [row] = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) =>
        tx
          .select()
          .from(schema.goodieBoxDispatches)
          .where(eq(schema.goodieBoxDispatches.id, dispatchId)),
    )
    expect(row?.status).toBe("dispatched")
    expect(row?.trackingNumber).toBe("EE123456789MY")
    expect(row?.dispatchedAt).not.toBeNull()
    expect(mockFlashToast).toHaveBeenCalledWith("success", "Marked dispatched.")
  })

  it("flashes a specific error when tracking number is missing, no throw", async () => {
    mockFlashToast.mockClear()
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    const formData = new FormData()
    formData.set("trackingNumber", "  ")

    await expect(markDispatched(dispatchId, formData)).resolves.toBeUndefined()
    expect(mockFlashToast).toHaveBeenCalledWith("error", "Tracking number is required.")
  })

  it("flashes a specific error when dispatch is already dispatched, no throw", async () => {
    mockFlashToast.mockClear()
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    // dispatchId was set to "dispatched" by the first test
    const formData = new FormData()
    formData.set("trackingNumber", "EE999999999MY")

    await expect(markDispatched(dispatchId, formData)).resolves.toBeUndefined()
    expect(mockFlashToast).toHaveBeenCalledWith("error", "Cannot dispatch: already 'dispatched'.")
  })

  it("a demoted admin gets a flashed error, no write", async () => {
    mockFlashToast.mockClear()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "buyer" } })

    const formData = new FormData()
    formData.set("trackingNumber", "EE555555555MY")

    await expect(markDispatched(dispatchId, formData)).resolves.toBeUndefined()
    expect(mockFlashToast).toHaveBeenCalledWith("error", "You don't have permission to do that.")
  })
})
