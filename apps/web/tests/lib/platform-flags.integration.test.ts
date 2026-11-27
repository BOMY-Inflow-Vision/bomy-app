/**
 * Real-DB check of the storefront flag lookup (migration 0041).
 *
 * Runs as the limited bomy_app role (DATABASE_APP_URL) so RLS fires: `readPaymentFlags()` must
 * return the true platform_config values through `withPublicRead` alone, and must not write an
 * `admin_bypass_audit` row. Values are only read here, never written.
 */
import { inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

import { readCheckoutEnabled, readPaymentFlags } from "@/lib/active-psp"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

describe.skipIf(!shouldRun)("readPaymentFlags against real RLS (bomy_app)", () => {
  let testDb: ReturnType<typeof makeDb>

  beforeAll(() => {
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await testDb.close()
  })

  async function auditCount(): Promise<number> {
    // This withAdmin call writes (and counts) its own audit row.
    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test count" }, (tx) =>
      tx.select({ c: sql<number>`count(*)::int` }).from(schema.adminBypassAudit),
    )
    return Number(row!.c)
  }

  it("returns the real flag values and writes no admin_bypass_audit row", async () => {
    const truth = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test truth" }, (tx) =>
      tx
        .select({ key: schema.platformConfig.key, value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(
          inArray(schema.platformConfig.key, [
            "checkout_enabled",
            "active_psp",
            "subscriptions_enabled",
          ]),
        ),
    )
    const byKey = new Map(truth.map((r) => [r.key, r.value]))
    // Fixture sanity: the seeded rows exist, so "off" below is a real read, not a missing row.
    expect(byKey.size).toBe(3)

    const before = await auditCount()
    const flags = await readPaymentFlags()
    const checkout = await readCheckoutEnabled()
    const after = await auditCount()

    expect(flags).toEqual({
      checkoutEnabled: byKey.get("checkout_enabled") === true,
      activePsp: byKey.get("active_psp"),
      subscriptionsEnabled: byKey.get("subscriptions_enabled") === true,
    })
    expect(checkout).toBe(byKey.get("checkout_enabled") === true)
    // Exactly one new row: the second auditCount() call's own. The flag reads added none.
    expect(after).toBe(before + 1)
  })
})
