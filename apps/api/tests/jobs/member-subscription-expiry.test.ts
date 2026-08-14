/**
 * Integration tests — expireMemberSubscriptions combinator (GAPS #9)
 *
 * The two underlying sweeps (expireCancelledMemberships,
 * expireAbandonedPendingMemberships) already have their own thorough test
 * files covering business-logic edge cases. This only proves the combinator
 * wires both of them together in one call, matching the pattern
 * expireSubscriptions (brand-subscription-expiry.ts) already uses.
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

import { expireMemberSubscriptions } from "../../src/jobs/member-subscription-expiry.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("expireMemberSubscriptions", () => {
  let testDb: ReturnType<typeof makeDb>

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await testDb.close()
  })

  it("runs both sweeps in one call and reports both counts", async () => {
    const userId = randomUUID()
    const cancelledSubId = randomUUID()
    const abandonedSubId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
      // Eligible for expireCancelledMemberships: active + cancelledAt set + periodEnd past.
      await tx.insert(schema.memberSubscriptions).values({
        id: cancelledSubId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: new Date(now.getTime() - 366 * 86400 * 1000),
        periodEnd: new Date(now.getTime() - 1000),
        cancelledAt: new Date(now.getTime() - 30 * 86400 * 1000),
      })
      // Eligible for expireAbandonedPendingMemberships: pending + no HitPay
      // payment id + createdAt past the 30-minute grace window.
      await tx.insert(schema.memberSubscriptions).values({
        id: abandonedSubId,
        userId,
        status: "pending",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
        createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      })
    })

    const result = await expireMemberSubscriptions(testDb.db)
    expect(result.cancelledCount).toBeGreaterThanOrEqual(1)
    expect(result.abandonedCount).toBeGreaterThanOrEqual(1)

    const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
      tx
        .select({ id: schema.memberSubscriptions.id, status: schema.memberSubscriptions.status })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.userId, userId)),
    )
    expect(rows.find((r) => r.id === cancelledSubId)?.status).toBe("cancelled")
    expect(rows.find((r) => r.id === abandonedSubId)?.status).toBe("expired")

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.userId, userId))
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
    })
  })
})
