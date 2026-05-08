/**
 * Integration tests — seller subscription plan actions
 *
 * Requires a live Postgres with bomy_app role and applied migrations.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/web test
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { auth } from "@/auth"
import { createPlan, updatePlan } from "../../src/app/seller/dashboard/subscriptions/actions"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

describe.skipIf(!shouldRun)("seller subscription plan actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let otherSellerId: string
  let storeId: string
  let otherStoreId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()
    otherSellerId = randomUUID()
    storeId = randomUUID()
    otherStoreId = randomUUID()

    await withAdmin(testDb.db, { userId: sellerId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
        { id: otherSellerId, email: `${otherSellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values([
        {
          id: storeId,
          ownerId: sellerId,
          name: "Seller Store",
          slug: `seller-store-${storeId.slice(0, 8)}`,
          status: "active",
        },
        {
          id: otherStoreId,
          ownerId: otherSellerId,
          name: "Other Store",
          slug: `other-store-${otherStoreId.slice(0, 8)}`,
          status: "active",
        },
      ])
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: sellerId, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.brandSubscriptionPlans)
        .where(eq(schema.brandSubscriptionPlans.storeId, storeId))
      await tx
        .delete(schema.brandSubscriptionPlans)
        .where(eq(schema.brandSubscriptionPlans.storeId, otherStoreId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, otherStoreId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
      await tx.delete(schema.users).where(eq(schema.users.id, otherSellerId))
    })
    await testDb.close()
  })

  describe("createPlan", () => {
    it("creates a plan with is_active=false (pending admin approval)", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await createPlan(
        makeFormData({
          termMonths: "3",
          priceMyrSen: "50.00",
          discountPct: "5",
          description: "3-month brand perks",
        }),
      )

      const rows = await withAdmin(
        testDb.db,
        { userId: sellerId, reason: "test assert" },
        async (tx) =>
          tx
            .select()
            .from(schema.brandSubscriptionPlans)
            .where(eq(schema.brandSubscriptionPlans.storeId, storeId)),
      )
      expect(rows).toHaveLength(1)
      const row = rows[0]!
      expect(row.termMonths).toBe(3)
      expect(row.priceMyrSen).toBe(5000n)
      expect(row.discountPct).toBe(5)
      expect(row.description).toBe("3-month brand perks")
      expect(row.isActive).toBe(false)
    })

    it("creates a 6-month plan for the same store", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await createPlan(makeFormData({ termMonths: "6", priceMyrSen: "90.00", discountPct: "8" }))

      const rows = await withAdmin(
        testDb.db,
        { userId: sellerId, reason: "test assert" },
        async (tx) =>
          tx
            .select({ termMonths: schema.brandSubscriptionPlans.termMonths })
            .from(schema.brandSubscriptionPlans)
            .where(eq(schema.brandSubscriptionPlans.storeId, storeId)),
      )
      expect(rows.some((r) => r.termMonths === 6)).toBe(true)
    })
  })

  describe("updatePlan", () => {
    let planId: string

    beforeAll(async () => {
      planId = randomUUID()
      await withAdmin(testDb.db, { userId: sellerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptionPlans).values({
          id: planId,
          storeId,
          termMonths: 12,
          priceMyrSen: 12000n,
          discountPct: 10,
          description: "annual plan",
          isActive: false,
        })
      })
    })

    it("updates price, discount, and description", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await updatePlan(
        planId,
        makeFormData({
          priceMyrSen: "150.00",
          discountPct: "7",
          description: "updated annual plan",
        }),
      )

      const [row] = await withAdmin(
        testDb.db,
        { userId: sellerId, reason: "test assert" },
        async (tx) =>
          tx
            .select()
            .from(schema.brandSubscriptionPlans)
            .where(eq(schema.brandSubscriptionPlans.id, planId)),
      )
      expect(row!.priceMyrSen).toBe(15000n)
      expect(row!.discountPct).toBe(7)
      expect(row!.description).toBe("updated annual plan")
      expect(row!.isActive).toBe(false)
    })

    it("throws when plan belongs to a different seller's store (RLS)", async () => {
      // otherSellerId tries to update sellerId's plan
      mockAuth.mockResolvedValue({
        user: { id: otherSellerId, role: "seller_owner", email: "other@test.bomy" },
      })

      await expect(
        updatePlan(planId, makeFormData({ priceMyrSen: "200.00", discountPct: "5" })),
      ).rejects.toThrow("Plan not found or not authorized")
    })
  })
})
