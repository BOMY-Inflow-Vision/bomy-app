/**
 * platform_config public flag read (migration 0041).
 *
 * Gated like rls.test.ts: needs DATABASE_APP_URL (the limited bomy_app role, so RLS actually
 * fires) and BOMY_RLS_READY=1.
 *
 * Asserts that non-staff contexts (withPublicRead, withTenant buyer / seller_owner) see exactly
 * checkout_enabled, active_psp and subscriptions_enabled, cannot write or lock any row, and that
 * staff visibility is unchanged.
 *
 * Safety: this file never commits a platform_config change. Every write attempt (and the staff
 * lock/update check) runs inside a transaction that is ALWAYS rolled back, so even if the policy
 * regressed (e.g. to FOR ALL) and a write got through, nothing would persist. The outcome of the
 * attempt is captured before the rollback and asserted afterwards. Other db test files (the ops
 * CLI flip test) change these rows concurrently, so assertions compare keys and refusal outcomes,
 * never whole-row snapshots.
 */
import { randomUUID } from "node:crypto"

import { eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db, type Database } from "../src/client.js"
import { platformConfig } from "../src/schema/index.js"
import { withAdmin, withPublicRead, withTenant, type TenantContext } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const PUBLIC_KEYS = ["active_psp", "checkout_enabled", "subscriptions_enabled"] as const
/** Keys other db test files create and delete while this file runs. */
const isTransientTestKey = (k: string) => k.startsWith("__test_") || k.startsWith("rls_probe_")

function pgErrorCode(err: unknown): string | undefined {
  if (err === null || typeof err !== "object") return undefined
  const e = err as { code?: string; cause?: { code?: string } }
  return e.code ?? e.cause?.code
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (err) {
    return err
  }
  return undefined
}

class Rollback extends Error {}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown }

describe.skipIf(!shouldRun)("platform_config public flag read (migration 0041)", () => {
  let handle: Db
  let otherKeys: string[] = []

  /**
   * Runs `fn` in a withTenant transaction that is always rolled back. Returns what `fn` returned
   * or the error it raised (an RLS refusal aborts the txn, which also rolls back).
   */
  async function attemptThenRollback<T>(
    ctx: TenantContext,
    fn: (tx: Database) => Promise<T>,
  ): Promise<Outcome<T>> {
    let outcome: Outcome<T> | undefined
    const err = await caught(
      withTenant(handle.db, ctx, async (tx) => {
        outcome = { ok: true, value: await fn(tx) }
        throw new Rollback()
      }),
    )
    if (err instanceof Rollback && outcome) return outcome
    return { ok: false, error: err }
  }

  const nonStaff: Array<{
    name: string
    readOnly: boolean
    run: <T>(fn: (tx: Database) => Promise<T>) => Promise<T>
  }> = [
    { name: "public (withPublicRead)", readOnly: true, run: (fn) => withPublicRead(handle.db, fn) },
    {
      name: "buyer (withTenant)",
      readOnly: false,
      run: (fn) => withTenant(handle.db, { userId: randomUUID(), userRole: "buyer" }, fn),
    },
    {
      name: "seller_owner (withTenant)",
      readOnly: false,
      run: (fn) =>
        withTenant(
          handle.db,
          { userId: randomUUID(), userRole: "seller_owner", sellerId: randomUUID() },
          fn,
        ),
    },
  ]

  // Write attempts need a read-write transaction, so RLS (not READ ONLY) is what refuses them.
  const writers: Array<{ name: string; ctx: () => TenantContext }> = [
    { name: "buyer", ctx: () => ({ userId: randomUUID(), userRole: "buyer" }) },
    {
      name: "seller_owner",
      ctx: () => ({ userId: randomUUID(), userRole: "seller_owner", sellerId: randomUUID() }),
    },
  ]

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })
    const all = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "test list keys" },
      (tx) => tx.select({ key: platformConfig.key }).from(platformConfig),
    )
    otherKeys = all
      .map((r) => r.key)
      .filter((k) => !isTransientTestKey(k) && !(PUBLIC_KEYS as readonly string[]).includes(k))
      .sort()
  })

  afterAll(async () => {
    await handle.close()
  })

  it("fixture sanity: the three flags and other, non-public keys are seeded", async () => {
    const flags = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx
        .select({ key: platformConfig.key })
        .from(platformConfig)
        .where(inArray(platformConfig.key, [...PUBLIC_KEYS]))
        .orderBy(platformConfig.key),
    )
    expect(flags.map((r) => r.key)).toEqual([...PUBLIC_KEYS])
    expect(otherKeys).toContain("platform_membership_price_myr_sen")
  })

  for (const ctx of nonStaff) {
    it(`${ctx.name}: an unfiltered SELECT returns exactly the three flag rows`, async () => {
      const rows = await ctx.run((tx) =>
        tx
          .select({ key: platformConfig.key, value: platformConfig.value })
          .from(platformConfig)
          .orderBy(platformConfig.key),
      )
      expect(rows.map((r) => r.key)).toEqual([...PUBLIC_KEYS])
      const byKey = new Map(rows.map((r) => [r.key, r.value]))
      expect(typeof byKey.get("checkout_enabled")).toBe("boolean")
      expect(typeof byKey.get("subscriptions_enabled")).toBe("boolean")
      expect(typeof byKey.get("active_psp")).toBe("string")
    })

    it(`${ctx.name}: non-public keys are invisible even when asked for by name`, async () => {
      const rows = await ctx.run((tx) =>
        tx
          .select({ key: platformConfig.key })
          .from(platformConfig)
          .where(inArray(platformConfig.key, otherKeys)),
      )
      expect(rows).toEqual([])
    })

    it(`${ctx.name}: cannot lock the flag rows`, async () => {
      for (const lock of [sql`FOR UPDATE`, sql`FOR SHARE`]) {
        const attempt = ctx.run((tx) =>
          tx.execute(sql`SELECT key FROM platform_config WHERE key = 'checkout_enabled' ${lock}`),
        )
        if (ctx.readOnly) {
          // withPublicRead: the READ ONLY transaction refuses row locks outright.
          expect(pgErrorCode(await caught(attempt))).toBe("25006")
        } else {
          // Read-write tenant txn: FOR UPDATE / FOR SHARE also apply the UPDATE policies
          // (staff-only), so the row is filtered out rather than locked.
          expect(Array.from(await attempt)).toEqual([])
        }
      }
    })
  }

  it("public (withPublicRead): any write is refused by the READ ONLY transaction (25006)", async () => {
    // READ ONLY refuses before anything is written, so there is nothing to roll back.
    const err = await caught(
      withPublicRead(handle.db, (tx) =>
        tx
          .update(platformConfig)
          .set({ value: true })
          .where(eq(platformConfig.key, "checkout_enabled")),
      ),
    )
    expect(pgErrorCode(err)).toBe("25006")
  })

  for (const w of writers) {
    it(`${w.name}: UPDATE of the public flags matches 0 rows`, async () => {
      const res = await attemptThenRollback(w.ctx(), (tx) =>
        tx
          .update(platformConfig)
          .set({ value: true, updatedAt: new Date() })
          .where(inArray(platformConfig.key, [...PUBLIC_KEYS]))
          .returning({ key: platformConfig.key }),
      )
      expect(res).toEqual({ ok: true, value: [] })
    })

    it(`${w.name}: DELETE of the public flags matches 0 rows`, async () => {
      const res = await attemptThenRollback(w.ctx(), (tx) =>
        tx
          .delete(platformConfig)
          .where(inArray(platformConfig.key, [...PUBLIC_KEYS]))
          .returning({ key: platformConfig.key }),
      )
      expect(res).toEqual({ ok: true, value: [] })
    })

    it(`${w.name}: INSERT of any key fails the staff WITH CHECK (42501)`, async () => {
      for (const key of ["checkout_enabled", `rls_probe_${randomUUID()}`]) {
        const res = await attemptThenRollback(w.ctx(), (tx) =>
          tx.insert(platformConfig).values({ key, value: true }).onConflictDoNothing(),
        )
        expect(res.ok, key).toBe(false)
        if (!res.ok) expect(pgErrorCode(res.error), key).toBe("42501")
      }
    })

    it(`${w.name}: TRUNCATE is not granted (42501)`, async () => {
      const res = await attemptThenRollback(w.ctx(), (tx) =>
        tx.execute(sql`TRUNCATE platform_config`),
      )
      expect(res.ok).toBe(false)
      if (!res.ok) expect(pgErrorCode(res.error)).toBe("42501")
    })
  }

  it("no tenant context and no bypass still sees nothing (default deny unchanged)", async () => {
    const rows = await handle.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_user_id', '', true)`)
      await tx.execute(sql`SELECT set_config('app.bypass_rls', 'false', true)`)
      return tx.select({ key: platformConfig.key }).from(platformConfig)
    })
    expect(rows).toEqual([])
  })

  it("staff (withTenant bomy_ops / bomy_admin / bomy_finance) still see every key", async () => {
    for (const role of ["bomy_ops", "bomy_admin", "bomy_finance"] as const) {
      const rows = await withTenant(handle.db, { userId: randomUUID(), userRole: role }, (tx) =>
        tx.select({ key: platformConfig.key }).from(platformConfig),
      )
      const keys = rows.map((r) => r.key).filter((k) => !isTransientTestKey(k))
      expect(keys.sort(), role).toEqual([...PUBLIC_KEYS, ...otherKeys].sort())
    }
  })

  it("staff can still lock and update a flag row (inside a rolled-back txn)", async () => {
    const res = await attemptThenRollback(
      { userId: randomUUID(), userRole: "bomy_ops" },
      async (tx) => {
        const locked = Array.from(
          await tx.execute(
            sql`SELECT key FROM platform_config WHERE key = 'checkout_enabled' FOR UPDATE`,
          ),
        )
        const updated = await tx
          .update(platformConfig)
          .set({ updatedAt: new Date() })
          .where(eq(platformConfig.key, "checkout_enabled"))
          .returning({ key: platformConfig.key })
        return { locked: locked.length, updated }
      },
    )
    expect(res).toEqual({ ok: true, value: { locked: 1, updated: [{ key: "checkout_enabled" }] } })
  })

  it("the policy exists exactly as 0041 defines it (SELECT, permissive, three keys)", async () => {
    const res = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test policy" }, (tx) =>
      tx.execute(sql`
        SELECT polcmd::text AS cmd, polpermissive AS permissive, pg_get_expr(polqual, polrelid) AS qual,
               polwithcheck IS NULL AS no_check
          FROM pg_policy
         WHERE polrelid = 'platform_config'::regclass
           AND polname = 'platform_config_public_flags_read'`),
    )
    const rows = Array.from(res) as Array<{
      cmd: string
      permissive: boolean
      qual: string
      no_check: boolean
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.cmd).toBe("r")
    expect(rows[0]!.permissive).toBe(true)
    expect(rows[0]!.no_check).toBe(true)
    for (const k of PUBLIC_KEYS) expect(rows[0]!.qual).toContain(`'${k}'::text`)
  })
})
