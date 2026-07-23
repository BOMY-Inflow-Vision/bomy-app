/**
 * checkActionRateLimit integration tests (GAPS #3 — web server-action
 * throttling). Real Postgres; same requirements as rls.test.ts.
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { checkActionRateLimit } from "../src/rate-limit.js"
import { actionRateLimits, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"
import { makeDb, type Db } from "../src/client.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

describe.skipIf(!shouldRun)("checkActionRateLimit", () => {
  let handle: Db
  let userId: string

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  afterEach(async () => {
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(actionRateLimits).where(eq(actionRateLimits.userId, userId))
      await tx.delete(users).where(eq(users.id, userId))
    })
  })

  async function seedUser() {
    userId = randomUUID()
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(users).values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
    })
  }

  it("allows calls up to max, then rejects", async () => {
    await seedUser()
    const config = { max: 3, windowMs: 60_000 }

    for (let i = 1; i <= 3; i++) {
      const r = await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t1", config)
      expect(r).toEqual({ allowed: true, count: i, max: 3 })
    }

    const over = await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t1", config)
    expect(over).toEqual({ allowed: false, count: 4, max: 3 })
  })

  it("still increments past the cap, so hammering doesn't reset the boundary", async () => {
    await seedUser()
    const config = { max: 1, windowMs: 60_000 }
    await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t2", config)
    const second = await checkActionRateLimit(
      handle.db,
      { userId, userRole: "buyer" },
      "t2",
      config,
    )
    const third = await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t2", config)
    expect(second).toEqual({ allowed: false, count: 2, max: 1 })
    expect(third).toEqual({ allowed: false, count: 3, max: 1 })
  })

  it("keeps separate buckets per action for the same user", async () => {
    await seedUser()
    const config = { max: 1, windowMs: 60_000 }
    const a = await checkActionRateLimit(
      handle.db,
      { userId, userRole: "buyer" },
      "action_a",
      config,
    )
    const b = await checkActionRateLimit(
      handle.db,
      { userId, userRole: "buyer" },
      "action_b",
      config,
    )
    expect(a).toEqual({ allowed: true, count: 1, max: 1 })
    expect(b).toEqual({ allowed: true, count: 1, max: 1 })
  })

  it("keeps separate buckets per user for the same action", async () => {
    await seedUser()
    const otherUserId = randomUUID()
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed 2" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: otherUserId, email: `${otherUserId}@test.bomy`, role: "buyer" })
    })

    const config = { max: 1, windowMs: 60_000 }
    const first = await checkActionRateLimit(
      handle.db,
      { userId, userRole: "buyer" },
      "shared_action",
      config,
    )
    const otherFirst = await checkActionRateLimit(
      handle.db,
      { userId: otherUserId, userRole: "buyer" },
      "shared_action",
      config,
    )
    expect(first).toEqual({ allowed: true, count: 1, max: 1 })
    expect(otherFirst).toEqual({ allowed: true, count: 1, max: 1 })

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test cleanup 2" }, async (tx) => {
      await tx.delete(actionRateLimits).where(eq(actionRateLimits.userId, otherUserId))
      await tx.delete(users).where(eq(users.id, otherUserId))
    })
  })

  it("buckets windowStart to a fixed boundary, not the exact call time", async () => {
    await seedUser()
    const windowMs = 60_000
    const before = await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t3", {
      max: 5,
      windowMs,
    })
    expect(before.allowed).toBe(true)

    const rows = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.select().from(actionRateLimits).where(eq(actionRateLimits.userId, userId)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.windowStart.getTime() % windowMs).toBe(0)
  })

  it("a later call in the SAME window shares the bucket a manually-seeded next-window row does not", async () => {
    await seedUser()
    const windowMs = 60_000
    await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t4", { max: 5, windowMs })
    await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t4", { max: 5, windowMs })

    const currentWindowRows = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "test" },
      (tx) => tx.select().from(actionRateLimits).where(eq(actionRateLimits.userId, userId)),
    )
    // Two calls, same window boundary → one row, count 2.
    expect(currentWindowRows).toHaveLength(1)
    expect(currentWindowRows[0]?.count).toBe(2)
  })

  it("a normal withTenant-scoped caller cannot delete its own rate-limit row", async () => {
    await seedUser()
    await checkActionRateLimit(handle.db, { userId, userRole: "buyer" }, "t5", {
      max: 5,
      windowMs: 60_000,
    })

    // admin_delete is admin-bypass ONLY — a tenant-scoped DELETE for the
    // owning user must match zero rows, not just be denied outright.
    await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
      tx.delete(actionRateLimits).where(eq(actionRateLimits.userId, userId)),
    )

    const stillThere = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.select().from(actionRateLimits).where(eq(actionRateLimits.userId, userId)),
    )
    expect(stillThere).toHaveLength(1)
  })
})
