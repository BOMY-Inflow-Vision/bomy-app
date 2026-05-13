/**
 * Integration tests — MembershipRenewalNotificationJob logic
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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { notifyRenewalsDue } from "../../src/jobs/membership-renewal-notification.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("notifyRenewalsDue", () => {
  let testDb: ReturnType<typeof makeDb>

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await testDb.close()
  })

  async function seedMember(
    periodEndOffsetMs: number,
    notifiedDays: number[] = [],
  ): Promise<{ userId: string; subId: string }> {
    const userId = randomUUID()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: new Date(now.getTime() - 365 * 86400 * 1000),
        periodEnd: new Date(now.getTime() + periodEndOffsetMs),
        notifiedDays: notifiedDays as unknown as never,
      })
    })

    return { userId, subId }
  }

  async function cleanup(userId: string, subId: string) {
    await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
    })
  }

  async function getNotifiedDays(subId: string): Promise<number[]> {
    const [row] = await withAdmin(
      testDb.db,
      { userId: "00000000-0000-0000-0000-000000000001", reason: "test assert" },
      async (tx) =>
        tx
          .select({ notifiedDays: schema.memberSubscriptions.notifiedDays })
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
    )
    return (row?.notifiedDays ?? []) as number[]
  }

  it("sends T-30 notification and records day 30 in notifiedDays", async () => {
    // 29 days to expiry — inside (14d, 30d] window
    const { userId, subId } = await seedMember(29 * 86400 * 1000)
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const count = await notifyRenewalsDue(testDb.db)
    expect(count).toBeGreaterThanOrEqual(1)

    const days = await getNotifiedDays(subId)
    expect(days).toContain(30)

    vi.restoreAllMocks()
    await cleanup(userId, subId)
  })

  it("sends T-7 notification and records day 7 in notifiedDays", async () => {
    // 6 days to expiry — inside (1d, 7d] window; [30,14] pre-seeded so those milestones skip
    const { userId, subId } = await seedMember(6 * 86400 * 1000, [30, 14])
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const count = await notifyRenewalsDue(testDb.db)
    expect(count).toBeGreaterThanOrEqual(1)

    const days = await getNotifiedDays(subId)
    expect(days).toContain(7)

    vi.restoreAllMocks()
    await cleanup(userId, subId)
  })

  it("fires only T-7 for a member with 6 days left and empty notifiedDays (no multi-match)", async () => {
    // Bug regression: old code fired T-30, T-14, and T-7 in one run for the same member.
    // Bounded windows ensure only the matching window fires.
    const { userId, subId } = await seedMember(6 * 86400 * 1000)
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    await notifyRenewalsDue(testDb.db)

    const days = await getNotifiedDays(subId)
    expect(days).toContain(7)
    expect(days).not.toContain(30)
    expect(days).not.toContain(14)

    vi.restoreAllMocks()
    await cleanup(userId, subId)
  })

  it("skips a member already notified for that milestone day", async () => {
    // notifiedDays already contains 30 — should not send again
    const { userId, subId } = await seedMember(29 * 86400 * 1000, [30])

    const countBefore = await getNotifiedDays(subId)
    await notifyRenewalsDue(testDb.db)
    const countAfter = await getNotifiedDays(subId)

    // Array unchanged — no duplicate 30
    expect(countAfter.filter((d) => d === 30)).toHaveLength(1)
    expect(countAfter.length).toBe(countBefore.length)

    await cleanup(userId, subId)
  })

  it("does not notify members whose subscription is not yet within any milestone window", async () => {
    // Period ends in 60 days — outside all (14d, 30d] and smaller windows
    const { userId, subId } = await seedMember(60 * 86400 * 1000)

    const daysBefore = await getNotifiedDays(subId)
    await notifyRenewalsDue(testDb.db)
    const daysAfter = await getNotifiedDays(subId)

    expect(daysAfter).toEqual(daysBefore)

    await cleanup(userId, subId)
  })
})
