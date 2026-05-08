/**
 * Integration tests — BrandSubscriptionExpiryJob logic
 *
 * Requires a live Postgres with the bomy_app role and applied migrations.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/api test
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { expireSubscriptions } from "../../src/jobs/brand-subscription-expiry.js"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("expireSubscriptions", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminUserId: string
  let storeId: string
  let planId: string

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    adminUserId = randomUUID()
    storeId = randomUUID()
    planId = randomUUID()

    await withAdmin(testDb.db, { userId: adminUserId, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: adminUserId, email: `${adminUserId}@test.bomy`, role: "bomy_admin" })
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: adminUserId,
        name: "Expiry Test Store",
        slug: `expiry-test-${storeId.slice(0, 8)}`,
        status: "active",
      })
      await tx.insert(schema.brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 3000n,
        discountPct: 5,
        isActive: true,
      })
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: adminUserId, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.brandSubscriptions)
        .where(eq(schema.brandSubscriptions.storeId, storeId))
      await tx
        .delete(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.userId, adminUserId))
      await tx
        .delete(schema.brandSubscriptionPlans)
        .where(eq(schema.brandSubscriptionPlans.id, planId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, adminUserId))
    })
    await testDb.close()
  })

  describe("brand_subscriptions expiry", () => {
    it("sets status='expired' for active brand subscriptions past periodEnd", async () => {
      const buyerId = randomUUID()
      const subId = randomUUID()
      const now = new Date()

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test seed" }, async (tx) => {
        await tx
          .insert(schema.users)
          .values({ id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" })
        await tx.insert(schema.brandSubscriptions).values({
          id: subId,
          userId: buyerId,
          storeId,
          planId,
          status: "active",
          priceMyrSen: 3000n,
          discountPct: 5,
          periodStart: new Date(now.getTime() - 90 * 86400 * 1000),
          periodEnd: new Date(now.getTime() - 1000),
          hitpayFeeSen: 90n,
          bomyCommissionSen: 291n,
          brandPayoutSen: 2619n,
        })
      })

      const result = await expireSubscriptions(testDb.db)
      expect(result.brandCount).toBeGreaterThanOrEqual(1)

      const [row] = await withAdmin(
        testDb.db,
        { userId: adminUserId, reason: "test assert" },
        async (tx) =>
          tx
            .select({ status: schema.brandSubscriptions.status })
            .from(schema.brandSubscriptions)
            .where(eq(schema.brandSubscriptions.id, subId)),
      )
      expect(row?.status).toBe("expired")

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      })
    })

    it("does not expire brand subscriptions whose periodEnd is in the future", async () => {
      const buyerId = randomUUID()
      const subId = randomUUID()
      const now = new Date()

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test seed" }, async (tx) => {
        await tx
          .insert(schema.users)
          .values({ id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" })
        await tx.insert(schema.brandSubscriptions).values({
          id: subId,
          userId: buyerId,
          storeId,
          planId,
          status: "active",
          priceMyrSen: 3000n,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 86400 * 1000),
          hitpayFeeSen: 90n,
          bomyCommissionSen: 291n,
          brandPayoutSen: 2619n,
        })
      })

      await expireSubscriptions(testDb.db)

      const [row] = await withAdmin(
        testDb.db,
        { userId: adminUserId, reason: "test assert" },
        async (tx) =>
          tx
            .select({ status: schema.brandSubscriptions.status })
            .from(schema.brandSubscriptions)
            .where(eq(schema.brandSubscriptions.id, subId)),
      )
      expect(row?.status).toBe("active")

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      })
    })
  })

  describe("member_subscriptions expiry (lapsed, not cancelled)", () => {
    it("sets status='expired' for active member subscriptions past periodEnd with no cancelledAt", async () => {
      const memberId = randomUUID()
      const subId = randomUUID()
      const now = new Date()

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test seed" }, async (tx) => {
        await tx
          .insert(schema.users)
          .values({ id: memberId, email: `${memberId}@test.bomy`, role: "buyer" })
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: memberId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(now.getTime() - 366 * 86400 * 1000),
          periodEnd: new Date(now.getTime() - 1000),
          // cancelledAt is null — lapsed renewal, not explicit cancellation
        })
      })

      const result = await expireSubscriptions(testDb.db)
      expect(result.memberCount).toBeGreaterThanOrEqual(1)

      const [row] = await withAdmin(
        testDb.db,
        { userId: adminUserId, reason: "test assert" },
        async (tx) =>
          tx
            .select({ status: schema.memberSubscriptions.status })
            .from(schema.memberSubscriptions)
            .where(eq(schema.memberSubscriptions.id, subId)),
      )
      expect(row?.status).toBe("expired")

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
        await tx.delete(schema.users).where(eq(schema.users.id, memberId))
      })
    })

    it("does not expire member subscriptions that have cancelledAt set (handled by expireCancelledMemberships)", async () => {
      const memberId = randomUUID()
      const subId = randomUUID()
      const now = new Date()

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test seed" }, async (tx) => {
        await tx
          .insert(schema.users)
          .values({ id: memberId, email: `${memberId}@test.bomy`, role: "buyer" })
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: memberId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(now.getTime() - 366 * 86400 * 1000),
          periodEnd: new Date(now.getTime() - 1000),
          cancelledAt: new Date(now.getTime() - 30 * 86400 * 1000),
        })
      })

      await expireSubscriptions(testDb.db)

      const [row] = await withAdmin(
        testDb.db,
        { userId: adminUserId, reason: "test assert" },
        async (tx) =>
          tx
            .select({ status: schema.memberSubscriptions.status })
            .from(schema.memberSubscriptions)
            .where(eq(schema.memberSubscriptions.id, subId)),
      )
      // Still 'active' — expireCancelledMemberships handles this case separately
      expect(row?.status).toBe("active")

      await withAdmin(testDb.db, { userId: adminUserId, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
        await tx.delete(schema.users).where(eq(schema.users.id, memberId))
      })
    })
  })
})
