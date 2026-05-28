import { randomUUID } from "node:crypto"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin, withTenant } from "../../src/index.js"
import { eq, and } from "drizzle-orm"

// @ts-expect-error -- module not yet implemented; remove this directive when Task 4 ships platform-config-flip-core.js
import { runPlatformConfigFlip } from "../../scripts/ops/platform-config-flip-core.js"

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("runPlatformConfigFlip — integration", () => {
  // Owner-role client for seeding (needs withAdmin to bypass RLS).
  let ownerDb: ReturnType<typeof makeDb>
  // Limited bomy_app client to exercise real RLS during the flip.
  let appDb: ReturnType<typeof makeDb>

  beforeAll(() => {
    ownerDb = makeDb({ url: process.env["DATABASE_URL"]! })
    appDb = makeDb({ url: process.env["DATABASE_APP_URL"]! })
  })

  afterAll(async () => {
    await ownerDb.close()
    await appDb.close()
  })

  // Per-test unique identifiers.
  let testKey: string
  let testReason: string
  let testActorId: string

  beforeEach(async () => {
    testKey = `__test_flip_${randomUUID()}`
    testReason = `integration test ${randomUUID()}`
    testActorId = randomUUID()

    // Seed actor + synthetic platform_config row under withAdmin.
    // This emits one admin_bypass_audit row (per tenant.ts:143) — fine;
    // assertions use narrow matchers (key + reason), not total counts.
    await withAdmin(
      ownerDb.db,
      { userId: "00000000-0000-0000-0000-000000000001", reason: "seed integration test" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: testActorId,
          email: `${testActorId}@test.bomy`,
          role: "bomy_admin",
        })
        await tx.insert(schema.platformConfig).values({
          key: testKey,
          value: false,
          description: "synthetic key for platform-config-flip integration test",
        })
      },
    )
  })

  afterEach(async () => {
    // Delete only the synthetic platform_config row.
    // platform_config_audit and admin_bypass_audit are append-only under RLS
    // (policies.sql:261-267 and :390-398) — leave those rows in place.
    await withAdmin(
      ownerDb.db,
      { userId: "00000000-0000-0000-0000-000000000001", reason: "cleanup integration test" },
      async (tx) => {
        await tx.delete(schema.platformConfig).where(eq(schema.platformConfig.key, testKey))
        await tx.delete(schema.users).where(eq(schema.users.id, testActorId))
      },
    )
  })

  it("flips the key, writes platform_config_audit + admin_bypass_audit rows under withAdmin", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const result = await runPlatformConfigFlip(appDb.db, {
      key: testKey,
      value: "true",
      actor: testActorId,
      reason: testReason,
    })

    // Result shape
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.actor.id).toBe(testActorId)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.actor.role).toBe("bomy_admin")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.oldValue).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.newValue).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.platformConfigAuditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.changedAt).toBeInstanceOf(Date)

    // Assertion reads use withTenant under the seeded admin's real role —
    // avoids emitting incidental admin_bypass_audit rows mid-assertion.
    await withTenant(appDb.db, { userId: testActorId, userRole: "bomy_admin" }, async (tx) => {
      // platform_config now has value=true, updated_by=testActorId.
      const [row] = await tx
        .select()
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, testKey))
      expect(row?.value).toBe(true)
      expect(row?.updatedBy).toBe(testActorId)

      // Exactly one platform_config_audit row matching key + actor.
      const auditRows = await tx
        .select()
        .from(schema.platformConfigAudit)
        .where(
          and(
            eq(schema.platformConfigAudit.key, testKey),
            eq(schema.platformConfigAudit.changedBy, testActorId),
          ),
        )
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]!.oldValue).toBe(false)
      expect(auditRows[0]!.newValue).toBe(true)

      // Exactly one admin_bypass_audit row matching actor + unique reason.
      const bypassRows = await tx
        .select()
        .from(schema.adminBypassAudit)
        .where(
          and(
            eq(schema.adminBypassAudit.actorUserId, testActorId),
            eq(schema.adminBypassAudit.reason, testReason),
          ),
        )
      expect(bypassRows).toHaveLength(1)
    })
  })
})
