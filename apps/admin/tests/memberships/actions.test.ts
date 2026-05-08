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

import { auth } from "@/auth"
import { cancelMembership } from "../../src/app/memberships/actions"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("cancelMembership", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let userId: string
  let subId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    userId = randomUUID()
    subId = randomUUID()

    await withAdmin(testDb.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
        { id: userId, email: `${userId}@test.bomy`, role: "buyer" },
      ])
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.userId, userId))
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
    })
    await testDb.close()
  })

  it("sets cancelled_at on an active membership", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    const now = new Date()
    await withAdmin(testDb.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        hitpayRecurringId: "rbill-test-123",
      })
    })

    await cancelMembership(subId)

    const [row] = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
    )
    expect(row?.cancelledAt).not.toBeNull()
    expect(row?.status).toBe("active")

    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
    })
  })
})
