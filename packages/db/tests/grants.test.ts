/**
 * bomy_app grant-matrix integration tests (GAPS #16).
 *
 * Proves migration 0027 (packages/db/drizzle/0027_bomy_app_least_privilege_grants.sql)
 * — applied via `pnpm --filter @bomy/db migrate` alone, no manual wildcard
 * grant step — leaves bomy_app with exactly the intended privileges: full
 * access to the 8 tables that migrations 0000/0001 never granted, and
 * narrower-than-full-CRUD on the tables whose policies (or, for the
 * no-RLS auth tables, the Auth.js adapter contract) never use every verb.
 *
 * Gated exactly like rls.test.ts. This test is EXPECTED to fail on an
 * environment that still carries the old wildcard grant (e.g. a long-lived
 * local Docker volume bootstrapped before migration 0027 existed) — that's
 * the test detecting real drift, not a bug in the test. Converge via
 * `psql ... < packages/db/src/rls/policies.sql` (mirrors 0027, including
 * its revokes) and re-run.
 *
 * See docs/superpowers/specs/2026-07-27-rls-grant-bootstrap-design.md for
 * the full per-table rationale behind every row below.
 */
import { randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { stores, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

interface TableGrant {
  select: boolean
  insert: boolean
  update: boolean
  delete: boolean
}

const FULL_CRUD: TableGrant = { select: true, insert: true, update: true, delete: true }

// Target grant per table — must match migration 0027 exactly (§2 of the
// design doc). Table order mirrors the migration's own matrix order.
const GRANT_MATRIX: Record<string, TableGrant> = {
  // origin: 0000
  users: { select: true, insert: true, update: true, delete: false }, // no DELETE policy
  stores: FULL_CRUD,
  ledger_entries: { select: true, insert: true, update: false, delete: false }, // append-only
  platform_config: FULL_CRUD,
  platform_config_audit: { select: true, insert: true, update: false, delete: false }, // append-only

  // origin: 0001 — no RLS; grants follow the Auth.js adapter contract
  accounts: { select: true, insert: true, update: false, delete: true }, // adapter has no updateAccount
  sessions: FULL_CRUD, // full adapter contract, unused today under session.strategy="jwt"
  verification_tokens: { select: true, insert: true, update: false, delete: true }, // SELECT needed for DELETE...WHERE

  // origin: 0002
  seller_inquiries: FULL_CRUD,

  // origin: 0003
  member_subscriptions: FULL_CRUD,
  brand_subscription_plans: { select: true, insert: true, update: true, delete: false }, // no DELETE policy
  brand_subscriptions: FULL_CRUD,
  vouchers: FULL_CRUD,
  goodie_box_dispatches: FULL_CRUD,

  // origin: 0008
  admin_bypass_audit: { select: true, insert: true, update: false, delete: false }, // append-only evidence trail

  // origin: 0009
  categories: FULL_CRUD,
  products: FULL_CRUD,
  product_variants: FULL_CRUD,
  product_images: FULL_CRUD,

  // origin: 0011
  checkout_sessions: FULL_CRUD,
  checkout_session_items: FULL_CRUD,
  checkout_session_stores: FULL_CRUD,
  inventory_reservations: FULL_CRUD,

  // origin: 0012
  orders: FULL_CRUD,
  order_items: FULL_CRUD,
  order_payouts: FULL_CRUD,
  processed_webhook_events: { select: true, insert: true, update: false, delete: false }, // payment idempotency guard

  // origin: 0014
  user_consents: { select: true, insert: true, update: false, delete: false }, // append-only

  // origin: 0015
  user_addresses: FULL_CRUD,

  // origin: 0016
  duplicate_charges: { select: true, insert: true, update: true, delete: false }, // no DELETE policy

  // origin: 0021
  body_image_upload_log: { select: true, insert: true, update: false, delete: true }, // no UPDATE policy

  // origin: 0025
  store_categories: FULL_CRUD,
  store_category_assignments: { select: true, insert: true, update: false, delete: true }, // no UPDATE on junction table

  // origin: 0026
  action_rate_limits: FULL_CRUD,
}

const GRANT_MATRIX_ROWS: Array<[table: string, verb: keyof TableGrant, expected: boolean]> =
  Object.entries(GRANT_MATRIX).flatMap(([table, grant]) =>
    (Object.keys(grant) as Array<keyof TableGrant>).map(
      (verb) => [table, verb, grant[verb]] as [string, keyof TableGrant, boolean],
    ),
  )

const APP_FUNCTIONS = [
  "assert_tenant_context()",
  "current_user_id()",
  "current_user_role()",
  "is_admin_bypass()",
  "is_bomy_staff()",
]

describe.skipIf(!shouldRun)("bomy_app grant matrix", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  describe("table privileges — exact booleans, not just no-throw", () => {
    it.each(GRANT_MATRIX_ROWS)("%s / %s = %s", async (table, verb, expected) => {
      const result = await handle.db.execute(
        sql`select has_table_privilege('bomy_app', ${table}, ${verb.toUpperCase()}) as ok`,
      )
      const rows = result as unknown as Array<{ ok: boolean }>
      expect(rows[0]?.ok).toBe(expected)
    })
  })

  describe("schema, function, and sequence access", () => {
    it("bomy_app has USAGE on schema public", async () => {
      const result = await handle.db.execute(
        sql`select has_schema_privilege('bomy_app', 'public', 'USAGE') as ok`,
      )
      const rows = result as unknown as Array<{ ok: boolean }>
      expect(rows[0]?.ok).toBe(true)
    })

    it("bomy_app has USAGE on schema app", async () => {
      const result = await handle.db.execute(
        sql`select has_schema_privilege('bomy_app', 'app', 'USAGE') as ok`,
      )
      const rows = result as unknown as Array<{ ok: boolean }>
      expect(rows[0]?.ok).toBe(true)
    })

    it.each(APP_FUNCTIONS)("bomy_app has EXECUTE on app.%s", async (fn) => {
      const result = await handle.db.execute(
        sql`select has_function_privilege('bomy_app', ${`app.${fn}`}, 'EXECUTE') as ok`,
      )
      const rows = result as unknown as Array<{ ok: boolean }>
      expect(rows[0]?.ok).toBe(true)
    })

    it("bomy_app does NOT have USAGE on _bomy_migrations_id_seq (wildcard overgrant, revoked)", async () => {
      const result = await handle.db.execute(
        sql`select has_sequence_privilege('bomy_app', '_bomy_migrations_id_seq', 'USAGE') as ok`,
      )
      const rows = result as unknown as Array<{ ok: boolean }>
      expect(rows[0]?.ok).toBe(false)
    })
  })

  describe("end-to-end chain: GUC -> app.* function -> RLS policy -> grant", () => {
    it("withTenant on stores (zero-grant before 0027) enforces cross-tenant isolation end to end", async () => {
      const sellerA = randomUUID()
      const sellerB = randomUUID()
      const storeAId = randomUUID()
      const storeBId = randomUUID()

      await withAdmin(
        handle.db,
        { userId: "00000000-0000-0000-0000-000000000001", reason: "grants test seed" },
        async (tx) => {
          await tx.insert(users).values([
            { id: sellerA, email: `${sellerA}@test.bomy`, role: "seller_owner" },
            { id: sellerB, email: `${sellerB}@test.bomy`, role: "seller_owner" },
          ])
          await tx.insert(stores).values([
            {
              id: storeAId,
              ownerId: sellerA,
              name: "Grants Test Store A",
              slug: `grants-a-${sellerA}`,
              status: "pending",
            },
            {
              id: storeBId,
              ownerId: sellerB,
              name: "Grants Test Store B",
              slug: `grants-b-${sellerB}`,
              status: "pending",
            },
          ])
        },
      )

      const aView = await withTenant(
        handle.db,
        { userId: sellerA, userRole: "seller_owner", sellerId: storeAId },
        async (tx) =>
          tx
            .select({ id: stores.id })
            .from(stores)
            .where(sql`true`),
      )
      const aIds = aView.map((r) => r.id)
      expect(aIds).toContain(storeAId)
      expect(aIds).not.toContain(storeBId)
    })

    it("withTenant DELETE on users rejects with permission denied (regression test for the silent-no-op bug this migration fixes)", async () => {
      const buyerId = randomUUID()
      await withAdmin(
        handle.db,
        { userId: "00000000-0000-0000-0000-000000000001", reason: "grants test seed" },
        async (tx) => {
          await tx
            .insert(users)
            .values({ id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" })
        },
      )

      await expect(
        withTenant(handle.db, { userId: buyerId, userRole: "buyer" }, async (tx) => {
          await tx.delete(users).where(sql`${users.id} = ${buyerId}`)
        }),
      ).rejects.toThrow(/permission denied/)
    })
  })
})
