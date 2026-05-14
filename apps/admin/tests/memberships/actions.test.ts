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
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@bomy/hitpay", () => ({
  HitPayClient: vi.fn().mockImplementation(() => ({
    cancelRecurringBilling: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { HitPayClient } from "@bomy/hitpay"
import { auth } from "@/auth"
import { cancelMembership } from "../../src/app/memberships/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

process.env["HITPAY_API_KEY"] = "test-key"
process.env["HITPAY_API_URL"] = "https://sandbox.hit-pay.com"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

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

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, userId))
      await tx
        .delete(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.userId, userId))
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
    })
    await testDb.close()
  })

  it("cancels HitPay recurring billing, sets cancelled_at, keeps status=active", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    // Each test uses its own userId-scoped subscription to avoid unique index conflicts.
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
        hitpayRecurringId: "rbill-test-123",
      })
    })

    const mockInstance = { cancelRecurringBilling: vi.fn().mockResolvedValue(undefined) }
    ;(HitPayClient as unknown as Mock).mockImplementation(() => mockInstance)

    await cancelMembership(tid)

    expect(mockInstance.cancelRecurringBilling).toHaveBeenCalledWith("rbill-test-123")

    const [row] = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) =>
        tx.select().from(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, tid)),
    )
    expect(row?.cancelledAt).not.toBeNull()
    expect(row?.status).toBe("active")

    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, tUserId))
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, tid))
      await tx.delete(schema.users).where(eq(schema.users.id, tUserId))
    })
  })

  it("sets cancelled_at without calling HitPay when no hitpayRecurringId, keeps status=active", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

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
        hitpayRecurringId: null,
      })
    })

    const mockInstance = { cancelRecurringBilling: vi.fn() }
    ;(HitPayClient as unknown as Mock).mockImplementation(() => mockInstance)

    await cancelMembership(tid)

    expect(mockInstance.cancelRecurringBilling).not.toHaveBeenCalled()

    const [row] = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) =>
        tx.select().from(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, tid)),
    )
    expect(row?.cancelledAt).not.toBeNull()
    expect(row?.status).toBe("active")

    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, tUserId))
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, tid))
      await tx.delete(schema.users).where(eq(schema.users.id, tUserId))
    })
  })

  it("throws when subscription is not active", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

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

    await expect(cancelMembership(sid)).rejects.toThrow("Cannot cancel")

    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, sid))
    })
  })
})
