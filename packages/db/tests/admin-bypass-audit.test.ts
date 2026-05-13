/**
 * Integration tests for admin_bypass_audit (PR #26).
 *
 * Same env-gating pattern as rls.test.ts:
 *   - DATABASE_APP_URL must point to the non-superuser bomy_app role
 *   - BOMY_RLS_READY=1 to confirm migrations + policies are applied
 */
import { randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { adminBypassAudit, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

describe.skipIf(!shouldRun)("admin_bypass_audit — migration shape", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("table exists with the expected columns and types", async () => {
    const rows = await handle.db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'admin_bypass_audit'
      ORDER BY ordinal_position
    `)
    // The shape of `rows` depends on the postgres driver wrapping.
    // Existing tests pull from `.rows` if present, else the value itself.
    const cols = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])
    const byName = Object.fromEntries(
      (cols as Array<{ column_name: string; data_type: string; is_nullable: string }>).map((c) => [
        c.column_name,
        c,
      ]),
    )

    expect(byName["id"]).toMatchObject({ data_type: "uuid", is_nullable: "NO" })
    expect(byName["actor_user_id"]).toMatchObject({ data_type: "uuid", is_nullable: "YES" })
    expect(byName["reason"]).toMatchObject({ data_type: "text", is_nullable: "NO" })
    expect(byName["created_at"]?.data_type).toBe("timestamp with time zone")
    expect(byName["created_at"]?.is_nullable).toBe("NO")
  })

  it("system actor row was seeded with the canonical UUID", async () => {
    const result = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "test: read system actor row" },
      async (tx) =>
        tx
          .select({ id: users.id, email: users.email, role: users.role })
          .from(users)
          .where(sql`id = ${SYSTEM_ACTOR}::uuid`),
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: SYSTEM_ACTOR,
      email: "system@bomy.internal",
      role: "bomy_admin",
    })
  })

  it("FORCE RLS is enabled on admin_bypass_audit", async () => {
    const rows = await handle.db.execute(sql`
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = 'admin_bypass_audit'
    `)
    const r = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])
    const row = (r as Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>)[0]
    expect(row?.relrowsecurity).toBe(true)
    expect(row?.relforcerowsecurity).toBe(true)
  })
})

describe.skipIf(!shouldRun)("admin_bypass_audit — withAdmin behavior", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("each withAdmin call writes exactly one audit row with the actor and reason", async () => {
    const reason = `it-test ${randomUUID()}`
    const actor = SYSTEM_ACTOR

    await withAdmin(handle.db, { userId: actor, reason }, () => Promise.resolve())
    // Intentionally empty callback — we are only testing the audit side effect.

    const rows = await withAdmin(
      handle.db,
      { userId: actor, reason: "test: read back audit rows" },
      async (tx) =>
        tx
          .select({ actorUserId: adminBypassAudit.actorUserId, reason: adminBypassAudit.reason })
          .from(adminBypassAudit)
          .where(sql`reason = ${reason}`),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ actorUserId: actor, reason })
  })

  it("audit row rolls back when the user callback throws", async () => {
    const reason = `rollback-test ${randomUUID()}`
    const actor = SYSTEM_ACTOR

    await expect(
      withAdmin(handle.db, { userId: actor, reason }, () => {
        throw new Error("simulated callback failure")
      }),
    ).rejects.toThrow("simulated callback failure")

    const rows = await withAdmin(
      handle.db,
      { userId: actor, reason: "test: confirm rolled-back audit absent" },
      async (tx) =>
        tx
          .select({ id: adminBypassAudit.id })
          .from(adminBypassAudit)
          .where(sql`reason = ${reason}`),
    )

    expect(rows).toHaveLength(0)
  })

  it("non-admin tenant cannot SELECT from admin_bypass_audit (default-deny + staff-only read)", async () => {
    const buyerId = randomUUID()
    const seedReason = `select-rls-check ${randomUUID()}`

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "test: seed buyer for audit RLS check" },
      async (tx) => {
        await tx.insert(users).values({
          id: buyerId,
          email: `${buyerId}@test.bomy`,
          role: "buyer" as const,
        })
      },
    )

    // Plant a known audit row so the assertion below is non-trivial:
    // if the buyer can see ANY row, this is the one we'd expect to leak.
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: seedReason }, () =>
      Promise.resolve(),
    )

    const buyerRows = await withTenant(
      handle.db,
      { userId: buyerId, userRole: "buyer" },
      async (tx) =>
        tx
          .select({ id: adminBypassAudit.id, reason: adminBypassAudit.reason })
          .from(adminBypassAudit),
    )

    // The buyer must not see the seeded row (nor any other row). Asserting
    // both length 0 and absence of the seeded reason — the second check
    // guarantees the test fails if RLS were ever weakened in a way that
    // returned just-this-user's-rows or some subset.
    expect(buyerRows).toHaveLength(0)
    expect(buyerRows.find((r) => r.reason === seedReason)).toBeUndefined()
  })

  it("non-admin tenant cannot INSERT into admin_bypass_audit", async () => {
    const buyerId = randomUUID()

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "test: seed buyer for audit INSERT RLS check" },
      async (tx) => {
        await tx.insert(users).values({
          id: buyerId,
          email: `${buyerId}@test.bomy`,
          role: "buyer" as const,
        })
      },
    )

    await expect(
      withTenant(handle.db, { userId: buyerId, userRole: "buyer" }, async (tx) =>
        tx.insert(adminBypassAudit).values({ actorUserId: buyerId, reason: "should fail" }),
      ),
    ).rejects.toThrow()
  })
})
