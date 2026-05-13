# Stage 5 PR #26 — Admin Bypass Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `withAdmin(...)` call write a durable audit row in the same transaction, so every RLS bypass leaves a permanent forensic trail. This is the mandatory prerequisite gating all of Stage 5 (no further `withAdmin` callsites may be added until this lands — see project_deferred_audit.md and spec §12.9).

**Architecture:** New `admin_bypass_audit` append-only table with `(actor_user_id, reason, created_at)`. Migration 0008 seeds a `system@bomy.internal` user row (`id = 00000000-0000-0000-0000-000000000001`) so background jobs can satisfy the FK. `withAdmin` in `packages/db/src/tenant.ts` is modified to INSERT one audit row inside the transaction, _after_ `set_config('app.bypass_rls', 'true')` so the insert is itself authorised by RLS. No callsite changes are required — the wrapper does all the work.

**Tech Stack:** Drizzle ORM, PostgreSQL 16, Vitest. RLS via `policies.sql` (hand-written, idempotent). Migrations are hand-written SQL under `packages/db/drizzle/`.

---

## File Structure

**Create:**

- `packages/db/src/schema/admin_bypass_audit.ts` — Drizzle table definition
- `packages/db/drizzle/0008_admin_bypass_audit.sql` — hand-written migration (table + seed system user + RLS enable/policies)
- `packages/db/tests/admin-bypass-audit.test.ts` — RLS + audit-write integration tests
- `packages/db/tests/withAdmin-audit.unit.test.ts` — unit test using a mocked transaction to assert the insert call shape

**Modify:**

- `packages/db/src/schema/index.ts` — add `export * from "./admin_bypass_audit.js"`
- `packages/db/src/tenant.ts:91-107` — extend `withAdmin` to insert audit row before invoking callback
- `packages/db/src/rls/policies.sql` — append `ENABLE/FORCE RLS` + default-deny + staff-read + bypass-only-insert policies for the new table

**Read-only references (do not modify in this PR):**

- `apps/api/src/jobs/*.ts` (4 files) — callsites continue to work unchanged
- `apps/api/src/routes/webhooks/hitpay.ts` — 3 callsites continue to work unchanged
- `apps/admin/src/app/**/actions.ts` (8 files) — callsites continue to work unchanged
- `apps/web/src/app/brands/[slug]/subscribe/actions.ts` — callsites continue to work unchanged

---

## Decisions Locked Before Writing Code

| Decision                                              | Value                                                                                                                                           | Reason                                                                                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_user_id` nullability                           | NULLABLE; FK to `users.id` `ON DELETE SET NULL`                                                                                                 | Match `platform_config_audit` pattern. Preserves audit row if actor user is later deleted. Always written non-null.                                                                |
| System actor representation                           | Seed `00000000-0000-0000-0000-000000000001` as `system@bomy.internal`, role `bomy_admin`                                                        | Required so background-job `withAdmin` calls satisfy the FK. Matches existing `SYSTEM_ACTOR` constant scattered across jobs/webhook.                                               |
| Where audit insert sits inside `withAdmin`            | After all three `set_config` calls (i.e. after `bypass_rls=true` is active), before the user callback                                           | The insert must itself be allowed by RLS; bypass must already be active. If the callback throws, the audit row rolls back along with the work — that's correct (no work happened). |
| `reason` length / shape                               | `text NOT NULL`, no max length, no enum                                                                                                         | Existing reasons range from short ("admin approve store") to formatted ("renewal notification T-${day}"). Keep flexible.                                                           |
| Extra metadata (table_name, affected_count, job_name) | **Out of scope for #26**. May be added in a later PR if forensic queries demand them.                                                           | YAGNI; the deferred memory marks them "optional"; spec §12 doesn't require them. Reason string already encodes purpose.                                                            |
| RLS on new table                                      | ENABLE + FORCE; default-deny RESTRICTIVE; SELECT for bomy_staff; INSERT only under `app.bypass_rls=true`; no UPDATE/DELETE policy (append-only) | Mirrors `platform_config_audit` exactly.                                                                                                                                           |

---

## Task 1: Add Drizzle schema for `admin_bypass_audit`

**Files:**

- Create: `packages/db/src/schema/admin_bypass_audit.ts`
- Modify: `packages/db/src/schema/index.ts` (add one export line)

- [ ] **Step 1.1: Write the file `packages/db/src/schema/admin_bypass_audit.ts`**

```typescript
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

/**
 * Append-only audit log of every `withAdmin` invocation. Written
 * inside the `withAdmin` transaction itself (see `tenant.ts`) so every
 * RLS bypass leaves a durable, transactional forensic trail.
 *
 * Pattern mirrors `platform_config_audit`:
 *   - `actor_user_id` is nullable with ON DELETE SET NULL so deleting
 *     the actor (or the seeded system user) never erases audit history.
 *     Always populated non-null on write — null is reserved for the
 *     ON-DELETE-SET-NULL case.
 *   - No UPDATE/DELETE policies — append-only enforced by FORCE RLS
 *     plus omission.
 *   - Indexed on (actor_user_id, created_at) and on created_at alone
 *     for the two expected forensic queries: "what did actor X do"
 *     and "what happened in window [t0, t1]".
 */
export const adminBypassAudit = pgTable(
  "admin_bypass_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index("admin_bypass_audit_actor_idx").on(t.actorUserId, t.createdAt),
    createdAtIdx: index("admin_bypass_audit_created_at_idx").on(t.createdAt),
  }),
)
```

- [ ] **Step 1.2: Add the re-export in `packages/db/src/schema/index.ts`**

Insert a new line, preserving alphabetical ordering (it sits between `auth.js` and `brand_subscription_plans.js`):

```typescript
export * from "./auth.js"
export * from "./admin_bypass_audit.js"
export * from "./brand_subscription_plans.js"
```

(If you discover the existing file orders by something other than strict alpha — match the existing convention; the important thing is the file is exported.)

- [ ] **Step 1.3: Typecheck**

Run: `pnpm --filter @bomy/db typecheck`
Expected: PASS — no TS errors. (If `@bomy/db` doesn't expose a `typecheck` script, run `pnpm -w typecheck` or the equivalent from `app/`.)

- [ ] **Step 1.4: Commit**

```bash
git add packages/db/src/schema/admin_bypass_audit.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add admin_bypass_audit schema"
```

---

## Task 2: Write the migration (table + system user seed + RLS)

**Files:**

- Create: `packages/db/drizzle/0008_admin_bypass_audit.sql`
- Modify: `packages/db/src/rls/policies.sql` (append policies + ENABLE/FORCE for the new table)

- [ ] **Step 2.1: Write the failing migration test first**

Create file `packages/db/tests/admin-bypass-audit.test.ts` with the migration assertion (the rest of the file will fill in across later tasks):

```typescript
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
    const cols =
      (
        rows as unknown as {
          rows: Array<{ column_name: string; data_type: string; is_nullable: string }>
        }
      ).rows ??
      (rows as unknown as Array<{ column_name: string; data_type: string; is_nullable: string }>)

    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]))

    expect(byName["id"]).toEqual({ column_name: "id", data_type: "uuid", is_nullable: "NO" })
    expect(byName["actor_user_id"]).toEqual({
      column_name: "actor_user_id",
      data_type: "uuid",
      is_nullable: "YES",
    })
    expect(byName["reason"]).toEqual({
      column_name: "reason",
      data_type: "text",
      is_nullable: "NO",
    })
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
    const r =
      (
        rows as unknown as {
          rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
        }
      ).rows ??
      (rows as unknown as Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>)
    expect(r[0]?.relrowsecurity).toBe(true)
    expect(r[0]?.relforcerowsecurity).toBe(true)
  })
})
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run (from `app/`):

```bash
DATABASE_APP_URL=$DATABASE_APP_URL BOMY_RLS_READY=1 pnpm --filter @bomy/db test admin-bypass-audit
```

Expected: FAIL — `admin_bypass_audit` does not exist (relation not found) or the `users` row with id `00000000-...-0001` is missing.

(If `shouldRun` evaluates false because env isn't set, set `DATABASE_APP_URL` first per the `tests/rls.test.ts` header comment. Without env, all assertions are skipped — that is **not** a pass.)

- [ ] **Step 2.3: Write the migration `packages/db/drizzle/0008_admin_bypass_audit.sql`**

```sql
-- Migration 0008: admin_bypass_audit + system user seed.
--
-- Closes the Stage 4 deferral (project_deferred_audit.md). After this
-- migration lands, packages/db/src/tenant.ts:withAdmin writes one audit
-- row per call inside the same transaction. Every RLS bypass thus
-- leaves a durable, transactional forensic trail.
--
-- Idempotency: every statement is guarded with IF NOT EXISTS / ON
-- CONFLICT DO NOTHING so re-runs and existing custom data are safe.

-- ─── 1. Seed the system actor user row ─────────────────────────────
-- Background jobs use SYSTEM_ACTOR = 00000000-0000-0000-0000-000000000001
-- as the withAdmin actor (see apps/api/src/jobs/*.ts and webhook).
-- Without this row, the FK on admin_bypass_audit.actor_user_id would
-- fail every job-initiated audit insert. Role is bomy_admin so it has
-- a sensible value in user_role-driven queries; the real privilege
-- check is the DB role + app.bypass_rls=true on the wrapper.

INSERT INTO "users" ("id", "email", "name", "role", "email_verified", "created_at", "updated_at")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@bomy.internal',
  'BOMY System Actor',
  'bomy_admin',
  now(),
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- ─── 2. admin_bypass_audit table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "admin_bypass_audit" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason"        text NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "admin_bypass_audit_actor_idx"
  ON "admin_bypass_audit" ("actor_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "admin_bypass_audit_created_at_idx"
  ON "admin_bypass_audit" ("created_at");
```

(Note: the verb `gen_random_uuid()` is already available via `pgcrypto`, enabled by the initial schema migration 0000. Verify by grepping `0000_initial_schema.sql` for `CREATE EXTENSION` if unsure.)

- [ ] **Step 2.4: Verify `gen_random_uuid()` is available**

Run from `app/`:

```bash
grep -n "gen_random_uuid\|CREATE EXTENSION" packages/db/drizzle/0000_initial_schema.sql | head -5
```

Expected: at least one hit confirming the extension is enabled OR the function is used elsewhere. If absent, prepend to migration 0008:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

- [ ] **Step 2.5: Append RLS policies in `packages/db/src/rls/policies.sql`**

Append the following to the file — slot the ENABLE/FORCE block into Section 3 (right after the `goodie_box_dispatches` ALTER) and the policy blocks into Section 5 (after the existing `goodie_box_dispatches_staff_write` policy, which is the current last allow policy before the `bomy_app role grants` section). Match the existing comment style.

In Section 3, append:

```sql
-- Stage 5 PR #26: durable admin bypass audit.
ALTER TABLE admin_bypass_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_bypass_audit FORCE ROW LEVEL SECURITY;
```

In Section 4 (default-deny), append:

```sql
CREATE POLICY admin_bypass_audit_default_deny ON admin_bypass_audit
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
```

In Section 5 (explicit allow), append:

```sql
-- admin_bypass_audit: append-only forensic log. Staff read; INSERT only
-- under an active bypass (the withAdmin wrapper sets app.bypass_rls=true
-- before its own insert). No UPDATE or DELETE policy — FORCE RLS plus
-- omission enforces append-only at the row layer.

CREATE POLICY admin_bypass_audit_staff_read ON admin_bypass_audit
  FOR SELECT
  USING (app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY admin_bypass_audit_bypass_insert ON admin_bypass_audit
  FOR INSERT
  WITH CHECK (app.is_admin_bypass());
```

`CREATE POLICY` in PostgreSQL does not support `IF NOT EXISTS`. The migration runner re-runs `policies.sql` on every migrate. To keep it idempotent, wrap the three new `CREATE POLICY` statements in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` blocks — matching the idiom used elsewhere in this file (see the `DO $$ BEGIN IF NOT EXISTS ... CREATE ROLE` block at the top).

Concretely, write each policy as:

```sql
DO $$ BEGIN
  CREATE POLICY admin_bypass_audit_default_deny ON admin_bypass_audit
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

…and the same wrapper for `_staff_read` and `_bypass_insert`. (If you discover that `policies.sql` is **not** re-run by the migrate script and is instead one-shot, drop the DO wrappers — but verify by grepping the migrate command in `packages/db/package.json` before deciding.)

- [ ] **Step 2.6: Verify migration script ordering**

Run from `app/`:

```bash
grep -n "policies\|drizzle" packages/db/package.json | head -10
ls packages/db/drizzle | sort
```

Expected: confirm the migrate script applies `drizzle/0008_admin_bypass_audit.sql` before (or alongside) `rls/policies.sql`. If the script applies SQL files in lexical order from `drizzle/`, then `0008_*.sql` is picked up automatically. The policies file is applied separately.

- [ ] **Step 2.7: Run the migration**

```bash
pnpm --filter @bomy/db migrate
```

Expected: migration 0008 applies; output mentions `admin_bypass_audit`. Re-run a second time — must be idempotent.

- [ ] **Step 2.8: Run the test from step 2.1 to verify it now passes**

```bash
DATABASE_APP_URL=$DATABASE_APP_URL BOMY_RLS_READY=1 pnpm --filter @bomy/db test admin-bypass-audit
```

Expected: the three tests in step 2.1 (`migration shape` describe block) PASS. The other describe blocks in the file (added in later tasks) will still be missing — that is fine.

- [ ] **Step 2.9: Commit**

```bash
git add \
  packages/db/drizzle/0008_admin_bypass_audit.sql \
  packages/db/src/rls/policies.sql \
  packages/db/tests/admin-bypass-audit.test.ts
git commit -m "feat(db): admin_bypass_audit table + RLS + system user seed (migration 0008)"
```

---

## Task 3: Update `withAdmin` to write an audit row inside the transaction

**Files:**

- Modify: `packages/db/src/tenant.ts:91-107`
- Create: `packages/db/tests/withAdmin-audit.unit.test.ts`

- [ ] **Step 3.1: Write the failing unit test**

`packages/db/tests/withAdmin-audit.unit.test.ts`:

```typescript
/**
 * Unit test: withAdmin must insert one admin_bypass_audit row inside
 * its own transaction, after bypass_rls is set, before the user
 * callback runs.
 *
 * This test uses a stub transaction object — no DB required. The
 * cross-tier "real DB" integration test lives in admin-bypass-audit.test.ts.
 */
import { describe, expect, it, vi } from "vitest"

import { withAdmin } from "../src/tenant.js"

interface CallRecord {
  kind: "execute" | "insert" | "callback"
  detail: string
}

function makeStubDb(records: CallRecord[]) {
  const tx = {
    execute: vi.fn(
      async (q: { strings?: readonly string[]; queryChunks?: unknown[] } & { sql?: string }) => {
        // Drizzle's sql template tag exposes its parts as `queryChunks`/`strings`
        // depending on the version. We just record that an execute happened.
        const repr = JSON.stringify(q).slice(0, 200)
        records.push({ kind: "execute", detail: repr })
        return [] as unknown
      },
    ),
    insert: vi.fn(() => ({
      values: vi.fn(async (v: unknown) => {
        records.push({ kind: "insert", detail: JSON.stringify(v) })
        return [] as unknown
      }),
    })),
  }
  const db = {
    transaction: async <T>(fn: (tx: typeof tx) => Promise<T>): Promise<T> => fn(tx),
  } as unknown as Parameters<typeof withAdmin>[0]
  return { db, tx }
}

describe("withAdmin — audit row insertion", () => {
  it("inserts exactly one audit row per call, with the actor + reason", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await withAdmin(
      db,
      { userId: "11111111-1111-1111-1111-111111111111", reason: "unit-test reason" },
      async () => {
        records.push({ kind: "callback", detail: "ran" })
      },
    )

    const inserts = records.filter((r) => r.kind === "insert")
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.detail).toContain("11111111-1111-1111-1111-111111111111")
    expect(inserts[0]?.detail).toContain("unit-test reason")
  })

  it("inserts the audit row before invoking the callback", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await withAdmin(
      db,
      { userId: "22222222-2222-2222-2222-222222222222", reason: "ordering check" },
      async () => {
        records.push({ kind: "callback", detail: "ran" })
      },
    )

    const insertIdx = records.findIndex((r) => r.kind === "insert")
    const callbackIdx = records.findIndex((r) => r.kind === "callback")
    expect(insertIdx).toBeGreaterThan(-1)
    expect(callbackIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeLessThan(callbackIdx)
  })

  it("inserts the audit row after bypass_rls is set", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await withAdmin(
      db,
      { userId: "33333333-3333-3333-3333-333333333333", reason: "bypass ordering" },
      async () => {
        // no-op
      },
    )

    const bypassIdx = records.findIndex(
      (r) => r.kind === "execute" && r.detail.includes("bypass_rls"),
    )
    const insertIdx = records.findIndex((r) => r.kind === "insert")
    expect(bypassIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(bypassIdx)
  })

  it("still rejects empty/whitespace reason (existing contract preserved)", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await expect(
      withAdmin(
        db,
        { userId: "44444444-4444-4444-4444-444444444444", reason: "" },
        async () => undefined,
      ),
    ).rejects.toThrow(/reason is required/i)

    await expect(
      withAdmin(
        db,
        { userId: "55555555-5555-5555-5555-555555555555", reason: "   " },
        async () => undefined,
      ),
    ).rejects.toThrow(/reason is required/i)

    expect(records.filter((r) => r.kind === "insert")).toHaveLength(0)
  })
})
```

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
pnpm --filter @bomy/db test withAdmin-audit.unit
```

Expected: FAIL on the first three tests because the current `withAdmin` doesn't call `tx.insert(...)` at all. The fourth test (empty-reason rejection) should already pass — that's existing behavior we don't want to regress.

- [ ] **Step 3.3: Update `packages/db/src/tenant.ts`**

Modify the `withAdmin` function (currently lines 91-107). Replace the body of the `db.transaction` callback with the version that inserts the audit row after `set_config('app.bypass_rls', 'true', true)`.

Final shape of the function:

```typescript
export async function withAdmin<T>(
  db: Database,
  adminCtx: { userId: string; reason: string },
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  assertUuid("userId", adminCtx.userId)
  if (!adminCtx.reason || adminCtx.reason.trim().length === 0) {
    throw new Error("withAdmin: reason is required for audit trail")
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${adminCtx.userId}, true)`)
    await tx.execute(sql`SELECT set_config('app.current_user_role', 'bomy_admin', true)`)
    await tx.execute(sql`SELECT set_config('app.bypass_rls', 'true', true)`)
    await tx.insert(adminBypassAudit).values({
      actorUserId: adminCtx.userId,
      reason: adminCtx.reason,
    })
    return fn(tx as Database)
  })
}
```

Add an import at the top of `tenant.ts` (just below the existing imports):

```typescript
import { adminBypassAudit } from "./schema/admin_bypass_audit.js"
```

Also update the function's docstring. Replace the existing JSDoc paragraph that begins with `"In production, connections that run admin workloads..."` with:

```typescript
/**
 * Escape hatch for admin services that legitimately need to see
 * cross-tenant data (reconciliation, ops console, migrations).
 *
 * Runs the callback inside a transaction under an explicit
 * `app.bypass_rls = true` flag (guardrail #3). This flag is paired
 * with RLS policies that allow a row only when either the tenant
 * clause matches OR `app.bypass_rls` is true.
 *
 * Every invocation writes one row to `admin_bypass_audit` *inside the
 * same transaction*, after `bypass_rls` is set so the insert is itself
 * authorised by RLS. If the user callback throws, both the work and
 * the audit row roll back together — which is correct, since no work
 * actually happened.
 *
 * The audit insert FKs `actor_user_id` → `users.id`. Background jobs
 * use the seeded system actor `00000000-0000-0000-0000-000000000001`
 * (see migration 0008). Any new background actor must seed its own
 * row before calling `withAdmin`.
 *
 * In production, connections that run admin workloads should use the
 * `bomy_admin` DB role (which has `BYPASSRLS` at the role level). For
 * API-layer admin flows against the app role, `app.bypass_rls` is the
 * mechanism.
 */
```

- [ ] **Step 3.4: Run the unit test to verify it passes**

```bash
pnpm --filter @bomy/db test withAdmin-audit.unit
```

Expected: PASS — all four tests.

- [ ] **Step 3.5: Run the full @bomy/db test suite to catch any regression**

```bash
DATABASE_APP_URL=$DATABASE_APP_URL BOMY_RLS_READY=1 pnpm --filter @bomy/db test
```

Expected: all tests PASS, including `rls.test.ts` (which uses `withAdmin` heavily for seeding) and `memberships.test.ts`.

If `rls.test.ts` now fails because the seeded test `withAdmin` calls reference random UUIDs that aren't in `users`, that's the FK breaking. Two fixes are possible:

- **Preferred:** Update `rls.test.ts` seeds to use the seeded system actor `00000000-0000-0000-0000-000000000001` for the "rls test seed" reason calls (cleaner — those calls represent system-level seeding). Replace lines like `{ userId: randomUUID(), reason: "rls test seed" }` with `{ userId: "00000000-0000-0000-0000-000000000001", reason: "rls test seed" }`.
- **Alternative:** Each affected test inserts its own actor user row first under a superuser connection — heavier, only do this if the preferred fix causes other failures.

Apply the preferred fix; re-run the suite.

- [ ] **Step 3.6: Commit**

```bash
git add packages/db/src/tenant.ts packages/db/tests/withAdmin-audit.unit.test.ts packages/db/tests/rls.test.ts
git commit -m "feat(db): withAdmin auto-writes admin_bypass_audit row"
```

---

## Task 4: Cross-tier integration tests

**Files:**

- Modify: `packages/db/tests/admin-bypass-audit.test.ts` (append more describe blocks)

- [ ] **Step 4.1: Append failing integration tests**

Add to the bottom of `packages/db/tests/admin-bypass-audit.test.ts`:

```typescript
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

    await withAdmin(handle.db, { userId: actor, reason }, async () => {
      // Intentionally empty — we are only testing the audit side effect.
    })

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
      withAdmin(handle.db, { userId: actor, reason }, async () => {
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
    // Seed a buyer user and try to read audit rows under a buyer session.
    const buyerId = randomUUID()

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

    const buyerRows = await withTenant(
      handle.db,
      { userId: buyerId, userRole: "buyer" },
      async (tx) => tx.select({ id: adminBypassAudit.id }).from(adminBypassAudit),
    )
    expect(buyerRows).toHaveLength(0)
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
```

- [ ] **Step 4.2: Run the new tests to verify they pass**

```bash
DATABASE_APP_URL=$DATABASE_APP_URL BOMY_RLS_READY=1 pnpm --filter @bomy/db test admin-bypass-audit
```

Expected: all describe blocks PASS — including the four new behavior tests.

If the rollback test fails (audit row persists), the bug is most likely that `withAdmin` was implemented to write the audit row in a separate transaction. Re-read `tenant.ts` and confirm the insert is inside the same `db.transaction` callback. The whole point is shared atomicity.

- [ ] **Step 4.3: Run an existing job test as a smoke check**

```bash
DATABASE_APP_URL=$DATABASE_APP_URL BOMY_RLS_READY=1 pnpm --filter @bomy/api test jobs/voucher-issuance
```

Expected: PASS. This exercises real `withAdmin` calls from `apps/api/src/jobs/voucher-issuance.ts`. Each invocation now writes an audit row inside its transaction — no callsite change required.

If it fails with a FK violation on `actor_user_id`, the system actor seed was not applied. Re-check the migration ran (`pnpm --filter @bomy/db migrate`) and the row exists (Task 2 step 2.8 first test).

- [ ] **Step 4.4: Commit**

```bash
git add packages/db/tests/admin-bypass-audit.test.ts
git commit -m "test(db): admin_bypass_audit cross-tier integration tests"
```

---

## Task 5: Full verification + PR

- [ ] **Step 5.1: Run the entire test suite from app root**

```bash
DATABASE_APP_URL=$DATABASE_APP_URL BOMY_RLS_READY=1 pnpm -w test
```

Expected: every package (db, api, web, admin) passes. No `withAdmin` callsite anywhere should break — the wrapper change is invisible to callers.

If any test fails citing FK violation on `admin_bypass_audit.actor_user_id`, the offending test seeds a `withAdmin({ userId: <random> })` against a non-existent user. Fix it the same way as `rls.test.ts` in step 3.5: use the seeded `SYSTEM_ACTOR` for system-level seed calls, or seed the actor user first.

- [ ] **Step 5.2: Lint + typecheck**

```bash
pnpm -w lint && pnpm -w typecheck
```

Expected: PASS, no warnings or errors.

- [ ] **Step 5.3: Verify no `withAdmin` callsite was edited**

```bash
git diff main..HEAD --stat -- apps/
```

Expected: empty (no `apps/` files changed). The whole point of doing this _inside_ `withAdmin` is that callsites don't need touching. If `apps/` shows up here, something went wrong — revisit before pushing.

The only allowed exception is `packages/db/tests/rls.test.ts` if step 3.5 required updating its seed actor — that's a test file, not a callsite.

- [ ] **Step 5.4: Push branch + open PR**

```bash
git push -u origin feat/admin-bypass-audit
```

Then:

```bash
gh pr create --title "feat: admin bypass audit (Stage 5 PR #26)" --body "$(cat <<'EOF'
## Summary

Closes the Stage 4 deferral (`project_deferred_audit.md`). Every `withAdmin(...)` call now writes one row to a new `admin_bypass_audit` table inside the same transaction, producing a durable, transactional forensic trail for every RLS bypass.

- New table `admin_bypass_audit (id, actor_user_id, reason, created_at)` — migration 0008
- System user `00000000-0000-0000-0000-000000000001` seeded in 0008 so background-job `withAdmin` calls satisfy the FK
- `packages/db/src/tenant.ts:withAdmin` writes the audit row after `app.bypass_rls=true` is set, before invoking the user callback — same transaction, atomic rollback semantics
- RLS: ENABLE + FORCE; default-deny RESTRICTIVE; staff-read; INSERT only when `app.bypass_rls=true`; no UPDATE/DELETE policy (append-only)
- No `apps/**` callsite changes required

This is the mandatory prerequisite for Stage 5 (spec §12.9). PRs #27–#33 cannot land until this is merged.

## Test plan

- [x] `pnpm --filter @bomy/db test` — schema + behavior + RLS integration tests
- [x] `pnpm -w test` — full suite, including job tests that exercise real `withAdmin`
- [x] `pnpm -w lint && pnpm -w typecheck`
- [x] Migration is idempotent (re-running 0008 + policies.sql is a no-op)
- [x] Audit row rolls back when callback throws
- [x] Non-admin tenants cannot SELECT or INSERT into `admin_bypass_audit`

## Model

Drafted on Opus 4.7 (load-bearing: schema + RLS + transaction semantics).
EOF
)"
```

Expected: PR opened. Return the URL to Charlie.

- [ ] **Step 5.5: Update handoff note**

Overwrite `app/.andy/handoff.md` with a fresh note: PR #26 in review, link, what's next (PR #27 catalog schema once #26 merges). State current commit, branch, model.

- [ ] **Step 5.6: Update auto-memory**

Once Charlie merges, write a log entry under MEMORY.md per `feedback_log_cadence.md` (one log per merged PR before starting the next). The "deferred audit" memory (`project_deferred_audit.md`) can be marked closed/removed.

---

## Self-Review (run before sharing the plan)

1. **Spec coverage:** PR #26 scope from spec §11 — "Migration 0008: `admin_bypass_audit` table. Update `withAdmin` in `packages/db/src/tenant.ts` to write audit row within same transaction. Retrofit `apps/api/src/routes/webhooks/hitpay.ts` + all `apps/api/src/jobs/*.ts`. Integration tests." All present.
   - The spec phrase "retrofit" is satisfied by the wrapper change itself — no per-callsite code edits are needed because every callsite already goes through `withAdmin`. The plan calls this out explicitly in Step 5.3.
2. **Placeholder scan:** None. Every code block is complete and ready to paste.
3. **Type consistency:** `adminBypassAudit` table name, `actorUserId`/`reason`/`createdAt` column names are identical across schema file, migration SQL (`actor_user_id`, `reason`, `created_at`), `withAdmin` insert, and tests. `SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"` matches the production constants across all four `apps/api/src/jobs/*.ts` and `apps/api/src/routes/webhooks/hitpay.ts`.

---

## Execution Handoff

Plan complete and saved to `app/docs/superpowers/plans/2026-05-13-stage5-pr26-admin-bypass-audit.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task; review between tasks; fast iteration.

**2. Inline Execution** — execute tasks in this session using `executing-plans`; batch with checkpoints at task boundaries.

Which approach?
