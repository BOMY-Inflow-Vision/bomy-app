/**
 * Integration tests — expireAbandonedPendingMemberships job
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

import {
  PENDING_GRACE_MS,
  expireAbandonedPendingMemberships,
} from "../../src/jobs/expire-abandoned-pending-memberships.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("expireAbandonedPendingMemberships", () => {
  let testDb: ReturnType<typeof makeDb>

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await testDb.close()
  })

  async function seedUser() {
    const userId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
    })
    return userId
  }

  async function cleanupUser(userId: string, subId: string) {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
    })
  }

  async function statusOf(subId: string): Promise<string | undefined> {
    const rows = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test assert" }, (tx) =>
      tx
        .select({ status: schema.memberSubscriptions.status })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.id, subId)),
    )
    return rows[0]?.status
  }

  it("expires a pending row with no payment id older than the grace window", async () => {
    const userId = await seedUser()
    const subId = randomUUID()
    const now = new Date()
    const createdAt = new Date(now.getTime() - PENDING_GRACE_MS - 60_000)

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "pending",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        createdAt,
      })
    })

    const n = await expireAbandonedPendingMemberships(testDb.db, now)
    expect(n).toBeGreaterThanOrEqual(1)
    expect(await statusOf(subId)).toBe("expired")

    await cleanupUser(userId, subId)
  })

  it("does not expire a fresh pending row inside the grace window", async () => {
    const userId = await seedUser()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "pending",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        createdAt: new Date(now.getTime() - 60_000), // 1 minute ago
      })
    })

    await expireAbandonedPendingMemberships(testDb.db, now)
    expect(await statusOf(subId)).toBe("pending")

    await cleanupUser(userId, subId)
  })

  it("does not expire a pending row that already has a payment id", async () => {
    const userId = await seedUser()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "pending",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        createdAt: new Date(now.getTime() - PENDING_GRACE_MS - 60_000),
        hitpayPaymentId: "pay_already_confirmed",
      })
    })

    await expireAbandonedPendingMemberships(testDb.db, now)
    expect(await statusOf(subId)).toBe("pending")

    await cleanupUser(userId, subId)
  })

  it("does not touch active rows", async () => {
    const userId = await seedUser()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: new Date(now.getTime() - 86400 * 1000),
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        createdAt: new Date(now.getTime() - PENDING_GRACE_MS - 60_000),
      })
    })

    await expireAbandonedPendingMemberships(testDb.db, now)
    expect(await statusOf(subId)).toBe("active")

    await cleanupUser(userId, subId)
  })
})
