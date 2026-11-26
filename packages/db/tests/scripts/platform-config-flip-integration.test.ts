import { randomUUID } from "node:crypto"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin, withTenant } from "../../src/index.js"
import { eq, and, sql } from "drizzle-orm"

import { runPlatformConfigFlip } from "../../scripts/ops/platform-config-flip-core.js"

const shouldRun =
  Boolean(process.env["DATABASE_URL"]) &&
  Boolean(process.env["DATABASE_APP_URL"]) &&
  process.env["BOMY_RLS_READY"] === "1"

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
      },
    )
  })

  it("rejects SYSTEM_ACTOR even though it has role bomy_admin", async () => {
    await expect(
      runPlatformConfigFlip(appDb.db, {
        key: testKey,
        value: "true",
        actor: "00000000-0000-0000-0000-000000000001",
        reason: testReason,
      }),
    ).rejects.toThrow(/SYSTEM_ACTOR/)
    // And specifically rejects with ActorError (not UsageError) — defense in depth.
    await expect(
      runPlatformConfigFlip(appDb.db, {
        key: testKey,
        value: "true",
        actor: "00000000-0000-0000-0000-000000000001",
        reason: testReason,
      }),
    ).rejects.toBeInstanceOf(
      (await import("../../scripts/ops/platform-config-flip-args.js")).ActorError,
    )
  })

  it("flips the key, writes platform_config_audit + admin_bypass_audit rows under withAdmin", async () => {
    const result = await runPlatformConfigFlip(appDb.db, {
      key: testKey,
      value: "true",
      actor: testActorId,
      reason: testReason,
    })

    // Result shape
    expect(result.actor.id).toBe(testActorId)
    expect(result.actor.role).toBe("bomy_admin")
    expect(result.oldValue).toBe(false)
    expect(result.newValue).toBe(true)
    expect(result.platformConfigAuditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
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

  // ── active_psp rules (Stripe design PR 3 review) ────────────────────────
  // Uses the REAL active_psp row. Value is never changed away from its current value, because
  // other files in this package assert the 0039 seed ("hitpay") in parallel; updated_by and
  // updated_at are restored exactly afterwards.
  describe("active_psp", () => {
    const SYSTEM = "00000000-0000-0000-0000-000000000001"
    let snapshot: { value: unknown; updatedBy: string | null; updatedAtText: string }

    async function setRole(role: "bomy_ops" | "bomy_finance") {
      await withAdmin(ownerDb.db, { userId: SYSTEM, reason: "test set role" }, (tx) =>
        tx.update(schema.users).set({ role }).where(eq(schema.users.id, testActorId)),
      )
    }

    beforeEach(async () => {
      const [row] = await withAdmin(ownerDb.db, { userId: SYSTEM, reason: "test snapshot" }, (tx) =>
        tx
          .select({
            value: schema.platformConfig.value,
            updatedBy: schema.platformConfig.updatedBy,
            updatedAtText: sql<string>`${schema.platformConfig.updatedAt}::text`,
          })
          .from(schema.platformConfig)
          .where(eq(schema.platformConfig.key, "active_psp")),
      )
      if (!row) throw new Error("active_psp must be seeded (0039)")
      snapshot = row
    })

    afterEach(async () => {
      await withAdmin(ownerDb.db, { userId: SYSTEM, reason: "test restore active_psp" }, (tx) =>
        tx
          .update(schema.platformConfig)
          .set({
            value: snapshot.value,
            updatedBy: snapshot.updatedBy,
            updatedAt: sql`${snapshot.updatedAtText}::timestamptz`,
          })
          .where(eq(schema.platformConfig.key, "active_psp")),
      )
    })

    it("bomy_ops is refused before any write", async () => {
      await setRole("bomy_ops")
      await expect(
        runPlatformConfigFlip(appDb.db, {
          key: "active_psp",
          value: JSON.stringify(snapshot.value),
          actor: testActorId,
          reason: testReason,
        }),
      ).rejects.toThrow(/bomy_admin \/ bomy_finance/)
      const audit = await withTenant(
        appDb.db,
        { userId: testActorId, userRole: "bomy_ops" },
        (tx) =>
          tx
            .select({ id: schema.platformConfigAudit.id })
            .from(schema.platformConfigAudit)
            .where(eq(schema.platformConfigAudit.changedBy, testActorId)),
      )
      expect(audit).toHaveLength(0)
    })

    it("an unknown provider value is refused", async () => {
      await expect(
        runPlatformConfigFlip(appDb.db, {
          key: "active_psp",
          value: '"paypal"',
          actor: testActorId,
          reason: testReason,
        }),
      ).rejects.toThrow(/not allowed/)
    })

    it("bomy_finance can write it, audited, with no credential check (emergency path)", async () => {
      await setRole("bomy_finance")
      // No HITPAY_* env in this process: the CLI must still succeed (design §11 kill switch).
      const result = await runPlatformConfigFlip(appDb.db, {
        key: "active_psp",
        value: JSON.stringify(snapshot.value),
        actor: testActorId,
        reason: testReason,
      })
      expect(result.actor.role).toBe("bomy_finance")
      expect(result.newValue).toEqual(snapshot.value)
      await withTenant(appDb.db, { userId: testActorId, userRole: "bomy_finance" }, async (tx) => {
        const audit = await tx
          .select({ key: schema.platformConfigAudit.key })
          .from(schema.platformConfigAudit)
          .where(eq(schema.platformConfigAudit.changedBy, testActorId))
        expect(audit).toEqual([{ key: "active_psp" }])
        const bypass = await tx
          .select({ id: schema.adminBypassAudit.id })
          .from(schema.adminBypassAudit)
          .where(
            and(
              eq(schema.adminBypassAudit.actorUserId, testActorId),
              eq(schema.adminBypassAudit.reason, testReason),
            ),
          )
        expect(bypass).toHaveLength(1)
      })
    })
  })
})
