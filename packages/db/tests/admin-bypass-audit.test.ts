/**
 * Integration tests for admin_bypass_audit (PR #26).
 *
 * Same env-gating pattern as rls.test.ts:
 *   - DATABASE_APP_URL must point to the non-superuser bomy_app role
 *   - BOMY_RLS_READY=1 to confirm migrations + policies are applied
 */
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { users } from "../src/schema/index.js"
import { withAdmin } from "../src/tenant.js"

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
