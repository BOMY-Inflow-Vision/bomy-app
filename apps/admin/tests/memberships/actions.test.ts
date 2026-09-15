/**
 * Integration tests — admin membership server actions
 *
 * Requires a live Postgres with bomy_app role and applied migrations.
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/admin test
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/flash-toast-server", () => ({ flashToast: vi.fn() }))
vi.mock("@bomy/hitpay", () => ({
  HitPayClient: vi.fn().mockImplementation(() => ({
    cancelRecurringBilling: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { HitPayClient } from "@bomy/hitpay"
import { auth } from "@/auth"
import { flashToast } from "@/lib/flash-toast-server"
import { cancelMembership } from "../../src/app/memberships/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

process.env["HITPAY_API_KEY"] = "test-key"
process.env["HITPAY_API_URL"] = "https://sandbox.hit-pay.com"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const mockFlash = flashToast as unknown as Mock

describe.skipIf(!shouldRun)("cancelMembership", () => {
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

  afterEach(() => {
    mockFlash.mockClear()
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, userId))
      await tx
        .delete(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.userId, userId))
    })
    await testDb.close()
  })

  async function seedActiveSub(hitpayRecurringId: string | null) {
    const tid = randomUUID()
    const tUserId = randomUUID()
    await withAdmin(testDb.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: tUserId, email: `${tUserId}@test.bomy`, role: "buyer" })
      const now = new Date()
      await tx.insert(schema.memberSubscriptions).values({
        id: tid,
        userId: tUserId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        hitpayRecurringId,
      })
    })
    return { tid, tUserId }
  }

  async function readSub(tid: string) {
    const [row] = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) =>
        tx.select().from(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, tid)),
    )
    return row
  }

  async function cleanup(tid: string, tUserId: string) {
    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, tUserId))
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, tid))
    })
  }

  function signInAsAdmin() {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })
  }

  it("cancels HitPay recurring billing, sets cancelled_at, keeps status=active, toasts success", async () => {
    signInAsAdmin()
    const { tid, tUserId } = await seedActiveSub("rbill-test-123")

    const mockInstance = { cancelRecurringBilling: vi.fn().mockResolvedValue(undefined) }
    ;(HitPayClient as unknown as Mock).mockImplementation(() => mockInstance)

    await expect(cancelMembership(tid)).resolves.toBeUndefined()

    expect(mockInstance.cancelRecurringBilling).toHaveBeenCalledWith("rbill-test-123")
    const row = await readSub(tid)
    expect(row?.cancelledAt).not.toBeNull()
    expect(row?.status).toBe("active")
    expect(mockFlash).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Membership cancelled"),
    )

    await cleanup(tid, tUserId)
  })

  it("sets cancelled_at without calling HitPay when no hitpayRecurringId, keeps status=active", async () => {
    signInAsAdmin()
    const { tid, tUserId } = await seedActiveSub(null)

    const mockInstance = { cancelRecurringBilling: vi.fn() }
    ;(HitPayClient as unknown as Mock).mockImplementation(() => mockInstance)

    await expect(cancelMembership(tid)).resolves.toBeUndefined()

    expect(mockInstance.cancelRecurringBilling).not.toHaveBeenCalled()
    const row = await readSub(tid)
    expect(row?.cancelledAt).not.toBeNull()
    expect(row?.status).toBe("active")
    expect(mockFlash).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Membership cancelled"),
    )

    await cleanup(tid, tUserId)
  })

  it("HitPay cancel fails → records nothing and toasts the error", async () => {
    signInAsAdmin()
    const { tid, tUserId } = await seedActiveSub("rbill-test-fail")

    const mockInstance = {
      cancelRecurringBilling: vi.fn().mockRejectedValue(new Error("HitPay 503")),
    }
    ;(HitPayClient as unknown as Mock).mockImplementation(() => mockInstance)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(cancelMembership(tid)).resolves.toBeUndefined()

    const row = await readSub(tid)
    // Renewal is still live at HitPay, so the cancellation must not be recorded.
    expect(row?.cancelledAt).toBeNull()
    expect(row?.status).toBe("active")
    expect(mockFlash).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("HitPay couldn't cancel the renewal"),
    )
    expect(mockFlash).not.toHaveBeenCalledWith("success", expect.anything())

    errorSpy.mockRestore()
    await cleanup(tid, tUserId)
  })

  it("toasts an error (and changes nothing) when the subscription is not active", async () => {
    signInAsAdmin()

    // Insert a cancelled subscription — cancel attempt should be rejected.
    const sid = randomUUID()
    const now = new Date()
    await withAdmin(testDb.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: sid,
        userId,
        status: "cancelled",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        cancelledAt: now,
      })
    })

    await expect(cancelMembership(sid)).resolves.toBeUndefined()
    expect(mockFlash).toHaveBeenCalledWith("error", expect.stringContaining("Cannot cancel"))

    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, sid))
    })
  })

  it("toasts an error for an unknown subscription id", async () => {
    signInAsAdmin()
    await expect(cancelMembership(randomUUID())).resolves.toBeUndefined()
    expect(mockFlash).toHaveBeenCalledWith("error", "Subscription not found.")
  })

  it("toasts a permission error for a non-admin instead of throwing", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "buyer@test.bomy" } })
    await expect(cancelMembership(randomUUID())).resolves.toBeUndefined()
    expect(mockFlash).toHaveBeenCalledWith("error", "You don't have permission to do that.")
  })
})
