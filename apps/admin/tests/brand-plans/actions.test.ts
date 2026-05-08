/**
 * Integration tests — admin brand-plans server actions
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { togglePlanActive } from "../../src/app/brand-plans/actions"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("togglePlanActive", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let ownerId: string
  let storeId: string
  let planId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    ownerId = randomUUID()
    storeId = randomUUID()
    planId = randomUUID()

    await withAdmin(testDb.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
        { id: ownerId, email: `${ownerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId,
        name: "Test Store",
        slug: `test-store-${storeId.slice(0, 8)}`,
        status: "active",
      })
      await tx.insert(schema.brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 5000n,
        discountPct: 5,
        isActive: false,
      })
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.brandSubscriptionPlans)
        .where(eq(schema.brandSubscriptionPlans.id, planId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, ownerId))
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
    })
    await testDb.close()
  })

  it("activates an inactive plan", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    await togglePlanActive(planId, true)

    const [row] = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) =>
        tx
          .select({ isActive: schema.brandSubscriptionPlans.isActive })
          .from(schema.brandSubscriptionPlans)
          .where(eq(schema.brandSubscriptionPlans.id, planId)),
    )
    expect(row?.isActive).toBe(true)
  })

  it("deactivates an active plan", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminId, role: "bomy_admin", email: "admin@test.bomy" },
    })

    await togglePlanActive(planId, false)

    const [row] = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) =>
        tx
          .select({ isActive: schema.brandSubscriptionPlans.isActive })
          .from(schema.brandSubscriptionPlans)
          .where(eq(schema.brandSubscriptionPlans.id, planId)),
    )
    expect(row?.isActive).toBe(false)
  })
})
