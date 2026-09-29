// packages/db/tests/service-categories.test.ts
import { randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { serviceCategories, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

describe.skipIf(!shouldRun)("service_categories RLS", () => {
  let handle: Db
  // Owner-role client for seeding only: service_categories intentionally
  // grants bomy_app SELECT-only (no admin CRUD UI yet — see migration 0031),
  // so withAdmin's app.bypass_rls flag can't get an INSERT past the table's
  // own GRANT on the bomy_app connection. Mirrors the owner/app split in
  // tests/scripts/platform-config-flip-integration.test.ts. The read under
  // test still goes through `handle` (bomy_app), unchanged.
  let ownerHandle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
    ownerHandle = makeDb({ url: process.env["DATABASE_URL"] as string })
  })

  afterAll(async () => {
    await handle.close()
    await ownerHandle.close()
  })

  it("a signed-in user sees only active categories, not inactive ones", async () => {
    const userId = randomUUID()
    await withAdmin(
      ownerHandle.db,
      { userId: SYSTEM_ACTOR, reason: "test seed user" },
      async (tx) => {
        await tx.insert(users).values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
      },
    )

    const activeId = randomUUID()
    const inactiveId = randomUUID()
    await withAdmin(ownerHandle.db, { userId, reason: "test seed categories" }, async (tx) => {
      await tx.insert(serviceCategories).values([
        { id: activeId, name: "Active Cat", slug: `active-${activeId}`, isActive: true },
        { id: inactiveId, name: "Inactive Cat", slug: `inactive-${inactiveId}`, isActive: false },
      ])
    })

    const rows = await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
      tx
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(sql`${serviceCategories.id} IN (${activeId}, ${inactiveId})`),
    )

    expect(rows.map((r) => r.id)).toEqual([activeId])
  })
})
