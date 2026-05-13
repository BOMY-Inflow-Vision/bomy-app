/**
 * Integration tests — expireCancelledMemberships job
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

import { expireCancelledMemberships } from "../../src/jobs/expire-cancelled-memberships.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("expireCancelledMemberships", () => {
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
    await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
    })
    await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
    })
  }

  it("sets status='cancelled' for active rows where cancelledAt is set and periodEnd is past", async () => {
    const userId = await seedUser()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: new Date(now.getTime() - 366 * 86400 * 1000),
        periodEnd: new Date(now.getTime() - 1000), // 1 second in the past
        cancelledAt: new Date(now.getTime() - 30 * 86400 * 1000),
      })
    })

    const n = await expireCancelledMemberships(testDb.db)
    expect(n).toBeGreaterThanOrEqual(1)

    const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
      tx
        .select({ status: schema.memberSubscriptions.status })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.id, subId)),
    )
    expect(rows[0]?.status).toBe("cancelled")

    await cleanupUser(userId, subId)
  })

  it("does not expire active rows where periodEnd is in the future", async () => {
    const userId = await seedUser()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000), // 1 year ahead
        cancelledAt: now,
      })
    })

    await expireCancelledMemberships(testDb.db)

    const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
      tx
        .select({ status: schema.memberSubscriptions.status })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.id, subId)),
    )
    expect(rows[0]?.status).toBe("active")

    await cleanupUser(userId, subId)
  })

  it("does not expire active rows where cancelledAt is null", async () => {
    const userId = await seedUser()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: new Date(now.getTime() - 366 * 86400 * 1000),
        periodEnd: new Date(now.getTime() - 1000),
        // cancelledAt = null (subscription lapsed, not explicitly cancelled)
      })
    })

    await expireCancelledMemberships(testDb.db)

    const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
      tx
        .select({ status: schema.memberSubscriptions.status })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.id, subId)),
    )
    expect(rows[0]?.status).toBe("active")

    await cleanupUser(userId, subId)
  })
})
