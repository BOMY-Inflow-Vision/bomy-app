# Service Provider Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed-in-only "service provider" application form — two new database tables, RLS, a validator, email dispatch, and a protected route — so a logged-in user can apply to become a BOMY service provider. Admin review and the future provider directory are explicitly out of scope.

**Architecture:** Two new Postgres tables (`service_categories`, a small admin-editable lookup; `service_provider_applications`, the submission record) reached exclusively through the existing `withTenant`/`withAdmin` wrappers, protected by RLS default-deny + narrow permissive policies. A new `/provider/apply` route (Next.js server page + client form + server action) sits behind the existing session-gate middleware. No new `UserRole`, no checkout/ledger/PSP involvement.

**Tech Stack:** Drizzle ORM (Postgres), Next.js 15 App Router (server actions, `useActionState`), hand-rolled validators (no Zod), `@bomy/mailer`, Vitest + real Postgres integration tests.

**Spec:** `app/docs/superpowers/specs/2026-09-28-service-provider-application-design.md` — read it before starting; this plan does not repeat its rationale, only its decisions.

## Global Constraints

- No Zod. Validators return `{ ok: true; value: T } | { ok: false; errors: Record<string, string> }` (spec, mirrors `apps/web/src/lib/shipping-address-schema.ts`).
- TypeScript strict; no `any` without a justifying comment.
- Every DB access goes through `withTenant` / `withPublicRead` / `withAdmin` — never raw `db`.
- Both new tables get `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, a RESTRICTIVE default-deny policy, and explicit permissive policies (spec §4).
- Any migration that creates a table or changes its grants must, in the same task, update: (1) the migration's own `GRANT`, (2) `packages/db/src/rls/policies.sql`, (3) `packages/db/tests/grants.test.ts` (existing project convention, cited directly in `policies.sql`'s own header comment).
- "Other" is a **UI-only** sentinel (`service_category_id IS NULL`) — it must **never** be a seeded row in `service_categories` (spec §3).
- The confirmation email must read `users.email` fresh inside the submission transaction — **never** trust the session/JWT's cached email claim, and **never** send to the form's typed `contact_email` field (spec §6).
- No Turnstile on this route — it is sign-in-gated; rely on `checkActionRateLimit` + the DB partial unique index instead (spec §5).
- Commits: this is Andy implementation work, so every commit carries the `Co-Authored-By: Claude` trailer.
- `pnpm --filter @bomy/db typecheck` and the relevant scoped test command must pass before every commit; run the full `pnpm test:integration` at the end of the last task.
- **Every task's commit step must re-verify `git branch --show-current` equals the feature branch (never `main`) immediately before running `git commit`.** This project has hit this exact failure before under subagent-driven execution (PR #88 Task 1 — a subagent committed to the main checkout instead of its worktree/branch); Task 0 creates the branch, but each subsequent task's own commit step must re-confirm it before writing, not just trust Task 0 ran.

## Review Focus

1. **Deactivated-category bypass** — submitting a `service_category_id` for a category that exists but has `is_active = false` must be rejected by both the RLS `INSERT` policy and the server action, never silently accepted. Covered in Task 2 (RLS test) and Task 6 (action test).
2. **Duplicate-application race** — two concurrent submissions from the same signed-in user must not both succeed; the second must fail on the DB partial unique index, not a 500, and the action must turn that into a friendly `"You already have an application on file."` error. Covered in Task 2 (RLS/constraint test) and Task 6 (action test).
3. **Stale-session email bug** — the confirmation email must go to the account's **current** `users.email`, read fresh inside the transaction, even when the session/JWT carries a different (stale) email. Covered in Task 6's action test.
4. **Finance-role over-exposure** — `bomy_finance` must get **zero** `SELECT` access to `service_provider_applications`; only the owning applicant and `bomy_ops`/`bomy_admin` can read rows. Covered in Task 2's RLS test.
5. **"Other"-row / approved-via-insert trap** — `service_categories` must never contain a row literally meaning "Other" (which would silently defeat the required-description rule), and an application `INSERT` must never be able to set `status` to anything but `'pending'` (only a future, separate admin path can approve). Covered in Task 1 (migration comment + no such seed row) and Task 2 (RLS test proving `status='approved'` on insert is rejected).

---

### Task 0: Create and verify the feature branch

**Files:** none — this task touches no files, only git state.

**Interfaces:** none. Every later task's commit step depends on this having run first.

- [ ] **Step 1: Confirm the repo is clean and on `main`**

Run: `git status` (expect: clean or only pre-existing untracked docs/plan files, no unexpected modifications) and `git branch --show-current` (expect: `main`).

- [ ] **Step 2: Create and check out the feature branch**

```bash
git checkout -b feat/service-provider-application
```

- [ ] **Step 3: Verify the branch is actually checked out**

Run: `git branch --show-current`
Expected output: `feat/service-provider-application` — **not** `main`. Do not proceed to Task 1 if this doesn't match exactly (this project has previously hit a subagent committing to the main checkout instead of its intended branch — PR #88 Task 1 — so this check is not optional).

---

### Task 1: `service_categories` table

**Files:**

- Create: `packages/db/src/schema/service_categories.ts`
- Modify: `packages/db/src/schema/index.ts` (add export, alphabetical between `seller_inquiries` and `service_provider_applications`)
- Create: `packages/db/drizzle/0031_service_categories.sql`
- Modify: `packages/db/scripts/migrate.mjs` (register migration `0031_service_categories`)
- Modify: `packages/db/src/rls/policies.sql` (append mirror section + grant line)
- Modify: `packages/db/tests/grants.test.ts` (add `service_categories` row to `GRANT_MATRIX`)
- Test: `packages/db/tests/service-categories.test.ts`

**Interfaces:**

- Produces: `serviceCategories` (Drizzle table, exported from `@bomy/db`'s `schema`) with columns `id: string`, `name: string`, `slug: string`, `sortOrder: number`, `isActive: boolean`, `createdAt: Date`. Task 2 references it via FK; Task 7's queries select from it.

- [ ] **Step 1: Write the schema file**

```ts
// packages/db/src/schema/service_categories.ts
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("service_categories_slug_unique_idx").on(t.slug),
    activeIdx: index("service_categories_active_idx").on(t.isActive),
  }),
)
```

- [ ] **Step 2: Export it from the schema barrel**

In `packages/db/src/schema/index.ts`, add this line alphabetically right after `export * from "./seller_inquiries.js"`:

```ts
export * from "./service_categories.js"
```

- [ ] **Step 3: Generate, then hand-augment, the migration**

Run: `pnpm --filter @bomy/db db:generate`

This scaffolds the base `CREATE TABLE` + indexes for `service_categories`. Open the generated file (it will be named `packages/db/drizzle/0031_<something>.sql` — rename it to `0031_service_categories.sql` if drizzle-kit picked a different slug) and edit it so its full content is exactly:

```sql
CREATE TABLE IF NOT EXISTS service_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS service_categories_slug_unique_idx ON service_categories (slug);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_categories_active_idx ON service_categories (is_active);
--> statement-breakpoint
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT ON service_categories TO bomy_app';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY service_categories_default_deny ON service_categories
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_categories_active_read ON service_categories
    FOR SELECT
    USING (is_active = true OR app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- Starter list. No admin CRUD UI yet (spec §3/§8) — edit via a new migration
-- until the admin-review PR adds a CRUD page. "Other" is a UI-only sentinel
-- (a NULL service_category_id on the application row) and must NEVER be a
-- row here — see service_provider_applications' CHECK constraint (0032),
-- which a real "Other" row would silently defeat.
INSERT INTO service_categories (id, name, slug, sort_order, is_active, created_at)
VALUES
  (gen_random_uuid(), 'Graphic Design',         'graphic-design',         10, true, now()),
  (gen_random_uuid(), 'Videography',            'videography',            20, true, now()),
  (gen_random_uuid(), 'Photography',             'photography',            30, true, now()),
  (gen_random_uuid(), 'Copywriting & Content',   'copywriting-content',    40, true, now()),
  (gen_random_uuid(), 'Web & App Development',   'web-app-development',   50, true, now())
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 4: Register the migration**

In `packages/db/scripts/migrate.mjs`, add this entry to the `MIGRATIONS` array, immediately after the `0030_seo_fields` entry:

```js
  {
    name: "0031_service_categories",
    file: join(__dirname, "../drizzle/0031_service_categories.sql"),
  },
```

- [ ] **Step 5: Mirror the RLS into `policies.sql`**

Append this new section at the very end of `packages/db/src/rls/policies.sql`:

```sql

-- ── service_categories (Service Provider Application; migration 0031) ──────
-- Admin-managed taxonomy for service-provider applications. Any signed-in
-- session reads active rows. No write policy yet — rows are migration-seeded
-- until the future admin-review PR adds a CRUD page (mirrors store_categories).

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE  ROW LEVEL SECURITY;

CREATE POLICY service_categories_default_deny ON service_categories
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY service_categories_active_read ON service_categories
  FOR SELECT
  USING (is_active = true OR app.is_bomy_staff() OR app.is_admin_bypass());
```

Then, inside the `bomy_app role grants` `DO $$ ... $$` block (§6), add this line right before the `-- app.* function execute` comment:

```sql
    -- origin: 0031
    EXECUTE 'GRANT SELECT ON "service_categories" TO bomy_app';

```

- [ ] **Step 6: Add the grant-matrix entry**

In `packages/db/tests/grants.test.ts`, add this to `GRANT_MATRIX`, right after the `// origin: 0026` block:

```ts
  // origin: 0031
  service_categories: { select: true, insert: false, update: false, delete: false },
```

- [ ] **Step 7: Write the failing RLS test**

```ts
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

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("a signed-in user sees only active categories, not inactive ones", async () => {
    const userId = randomUUID()
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed user" }, async (tx) => {
      await tx.insert(users).values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
    })

    const activeId = randomUUID()
    const inactiveId = randomUUID()
    await withAdmin(handle.db, { userId, reason: "test seed categories" }, async (tx) => {
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
```

- [ ] **Step 8: Run it to verify it fails**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 REDIS_URL=redis://:changeme_local@localhost:6379 pnpm --filter @bomy/db test service-categories.test.ts --run`
Expected: FAIL — table `service_categories` does not exist yet.

- [ ] **Step 9: Apply the migration**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db migrate`
Expected: `apply 0031_service_categories ... done`

- [ ] **Step 10: Run the test again to verify it passes**

Run the same command as Step 8.
Expected: PASS.

- [ ] **Step 11: Run the grants test to confirm the matrix matches reality**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/db test grants.test.ts --run`
Expected: PASS (all rows, including the new `service_categories` row).

- [ ] **Step 12: Commit**

```bash
git add packages/db/src/schema/service_categories.ts packages/db/src/schema/index.ts \
  packages/db/drizzle/0031_service_categories.sql packages/db/scripts/migrate.mjs \
  packages/db/src/rls/policies.sql packages/db/tests/grants.test.ts \
  packages/db/tests/service-categories.test.ts
git commit -m "feat(db): add service_categories lookup table with RLS"
```

---

### Task 2: `service_provider_applications` table

**Files:**

- Create: `packages/db/src/schema/service_provider_applications.ts`
- Modify: `packages/db/src/schema/index.ts` (add export, alphabetical between `service_categories` and `store_categories`)
- Create: `packages/db/drizzle/0032_service_provider_applications.sql`
- Modify: `packages/db/scripts/migrate.mjs` (register migration `0032_service_provider_applications`)
- Modify: `packages/db/src/rls/policies.sql` (append mirror section + grant lines)
- Modify: `packages/db/tests/grants.test.ts` (add `service_provider_applications` row)
- Test: `packages/db/tests/service-provider-applications.test.ts`

**Interfaces:**

- Consumes: `serviceCategories` (Task 1).
- Produces: `serviceProviderApplications` (Drizzle table) with columns `id: string`, `applicantUserId: string`, `name: string`, `contactEmail: string`, `contactNumber: string`, `companyName: string`, `serviceCategoryId: string | null`, `businessDescription: string | null`, `status: "pending" | "approved" | "rejected"`, `createdAt: Date`. Task 6's server action inserts into it; Task 7's queries select from it.

- [ ] **Step 1: Write the schema file**

```ts
// packages/db/src/schema/service_provider_applications.ts
import { sql } from "drizzle-orm"
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { inquiryStatusEnum } from "./enums.js"
import { serviceCategories } from "./service_categories.js"
import { users } from "./users.js"

export const serviceProviderApplications = pgTable(
  "service_provider_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantUserId: uuid("applicant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactNumber: text("contact_number").notNull(),
    companyName: text("company_name").notNull(),
    serviceCategoryId: uuid("service_category_id").references(() => serviceCategories.id, {
      onDelete: "restrict",
    }),
    businessDescription: text("business_description"),
    status: inquiryStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    applicantIdx: index("service_provider_applications_applicant_idx").on(t.applicantUserId),
    // At most one open (pending or approved) application per account — DB-level,
    // race-safe duplicate prevention (spec §3). A rejected row doesn't count, so
    // re-applying after rejection is allowed today (open question, deferred).
    oneOpenPerUser: uniqueIndex("service_provider_applications_one_open_per_user_idx")
      .on(t.applicantUserId)
      .where(sql`${t.status} IN ('pending','approved')`),
    // "Other" (NULL category) requires a non-empty description. Enforced here,
    // not just in the validator, because it's the only guarantee that survives
    // a direct/buggy insert (spec §3).
    categoryOrDescriptionChk: check(
      "service_provider_applications_category_or_description_chk",
      sql`${t.serviceCategoryId} IS NOT NULL OR (${t.businessDescription} IS NOT NULL AND length(trim(${t.businessDescription})) > 0)`,
    ),
  }),
)
```

- [ ] **Step 2: Export it from the schema barrel**

In `packages/db/src/schema/index.ts`, add this line alphabetically right after `export * from "./service_categories.js"`:

```ts
export * from "./service_provider_applications.js"
```

- [ ] **Step 3: Generate, then hand-augment, the migration**

Run: `pnpm --filter @bomy/db db:generate`

Rename the generated file to `packages/db/drizzle/0032_service_provider_applications.sql` if needed, and edit it so its full content is exactly:

```sql
CREATE TABLE IF NOT EXISTS service_provider_applications (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name                  TEXT        NOT NULL,
  contact_email         TEXT        NOT NULL,
  contact_number        TEXT        NOT NULL,
  company_name          TEXT        NOT NULL,
  service_category_id   UUID        REFERENCES service_categories(id) ON DELETE RESTRICT,
  business_description  TEXT,
  status                inquiry_status NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_provider_applications_category_or_description_chk CHECK (
    service_category_id IS NOT NULL
    OR (business_description IS NOT NULL AND length(trim(business_description)) > 0)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS service_provider_applications_one_open_per_user_idx
  ON service_provider_applications (applicant_user_id)
  WHERE status IN ('pending', 'approved');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_provider_applications_applicant_idx
  ON service_provider_applications (applicant_user_id);
--> statement-breakpoint
ALTER TABLE service_provider_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_provider_applications FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON service_provider_applications TO bomy_app';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY service_provider_applications_default_deny ON service_provider_applications
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INSERT: an applicant may only insert a 'pending' row for themselves, naming
-- either NULL ("Other") or a CURRENTLY ACTIVE category. The EXISTS clause is a
-- correlated subquery inside the policy — a normal, supported RLS pattern
-- (unlike a plain CHECK constraint, which cannot reference another table) —
-- closing the gap where a deactivated category's id would otherwise still
-- pass the FK constraint (the row still exists, it's just retired).
DO $$ BEGIN
  CREATE POLICY service_provider_applications_self_insert ON service_provider_applications
    FOR INSERT
    WITH CHECK (
      (
        applicant_user_id = app.current_user_id()
        AND status = 'pending'
        AND (
          service_category_id IS NULL
          OR EXISTS (
            SELECT 1 FROM service_categories sc
            WHERE sc.id = service_category_id AND sc.is_active
          )
        )
      )
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SELECT: applicant sees their own row. Staff read is deliberately NARROWER
-- than the codebase's usual app.is_bomy_staff() helper (which also includes
-- bomy_finance) — finance doesn't need applicant contact details for this
-- table. Do not "fix" this back to is_bomy_staff() by habit.
DO $$ BEGIN
  CREATE POLICY service_provider_applications_read ON service_provider_applications
    FOR SELECT
    USING (
      applicant_user_id = app.current_user_id()
      OR app.current_user_role() IN ('bomy_ops', 'bomy_admin')
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No UPDATE or DELETE policy at all this round — approving/rejecting is out of
-- scope (spec §1/§8). The future admin-review PR adds an UPDATE policy
-- (USING app.is_admin_bypass()) alongside the real approve/reject actions.
```

- [ ] **Step 4: Register the migration**

In `packages/db/scripts/migrate.mjs`, add this entry immediately after the `0031_service_categories` entry:

```js
  {
    name: "0032_service_provider_applications",
    file: join(__dirname, "../drizzle/0032_service_provider_applications.sql"),
  },
```

- [ ] **Step 5: Mirror the RLS into `policies.sql`**

Append this section at the very end of `packages/db/src/rls/policies.sql`, after the `service_categories` block added in Task 1:

```sql

-- ── service_provider_applications (Service Provider Application; migration 0032) ──
-- Applicant self-insert (own row, pending only, active-category-only); read
-- narrowed to owner + bomy_ops/bomy_admin (NOT bomy_finance). No UPDATE/DELETE
-- policy this round — approving/rejecting is a future, separate PR.

ALTER TABLE service_provider_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_provider_applications FORCE  ROW LEVEL SECURITY;

CREATE POLICY service_provider_applications_default_deny ON service_provider_applications
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY service_provider_applications_self_insert ON service_provider_applications
  FOR INSERT
  WITH CHECK (
    (
      applicant_user_id = app.current_user_id()
      AND status = 'pending'
      AND (
        service_category_id IS NULL
        OR EXISTS (
          SELECT 1 FROM service_categories sc
          WHERE sc.id = service_category_id AND sc.is_active
        )
      )
    )
    OR app.is_admin_bypass()
  );

CREATE POLICY service_provider_applications_read ON service_provider_applications
  FOR SELECT
  USING (
    applicant_user_id = app.current_user_id()
    OR app.current_user_role() IN ('bomy_ops', 'bomy_admin')
    OR app.is_admin_bypass()
  );
```

Then, inside the `bomy_app role grants` `DO $$ ... $$` block (§6), add this line right after the `-- origin: 0031` line added in Task 1:

```sql
    -- origin: 0032
    EXECUTE 'GRANT SELECT, INSERT ON "service_provider_applications" TO bomy_app';

```

- [ ] **Step 6: Add the grant-matrix entry**

In `packages/db/tests/grants.test.ts`, add this right after the `service_categories` row added in Task 1:

```ts
  // origin: 0032
  service_provider_applications: { select: true, insert: true, update: false, delete: false },
```

- [ ] **Step 7: Write the failing RLS/constraint tests**

```ts
// packages/db/tests/service-provider-applications.test.ts
import { randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { serviceCategories, serviceProviderApplications, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

// Every fixture below includes a non-empty businessDescription by default, so
// the CHECK constraint (service_category_id IS NOT NULL OR description
// non-empty) is already satisfied regardless of whether a given test ALSO
// sets a category. Without this, a fixture naming neither would fail on the
// CHECK before the RLS/duplicate behavior under test ever runs — Charlie's
// review (2026-09-29) caught exactly this: the "rejects status='approved'"
// test could have passed because the CHECK fired first, not because the RLS
// policy's status check actually fired.
const BASE_FIELDS = {
  name: "Aisha",
  contactEmail: "aisha@example.com",
  contactNumber: "+60123456789",
  companyName: "Aisha Studio",
  businessDescription: "I design brand identities for local cafes.",
}

// Reads the Postgres SQLSTATE off a caught error, so a test can assert WHICH
// mechanism rejected an insert (42501 = RLS policy violation, 23514 = CHECK
// violation, 23505 = unique violation) instead of just "it threw" — the three
// are different bugs if the wrong one fires.
function pgErrorCode(err: unknown): string | undefined {
  return err !== null && typeof err === "object" && "code" in err
    ? (err as { code?: string }).code
    : undefined
}

async function seedUser(handle: Db, role: "buyer" | "bomy_finance" | "bomy_ops" = "buyer") {
  const userId = randomUUID()
  await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed user" }, async (tx) => {
    await tx.insert(users).values({ id: userId, email: `${userId}@test.bomy`, role })
  })
  return userId
}

async function seedCategory(handle: Db, userId: string, isActive: boolean) {
  const id = randomUUID()
  await withAdmin(handle.db, { userId, reason: "test seed category" }, async (tx) => {
    await tx
      .insert(serviceCategories)
      .values({ id, name: "Test Cat", slug: `test-${id}`, isActive })
  })
  return id
}

describe.skipIf(!shouldRun)("service_provider_applications RLS", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("an applicant can insert their own pending application naming an active category", async () => {
    const userId = await seedUser(handle)
    const categoryId = await seedCategory(handle, userId, true)

    const rows = await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
      tx
        .insert(serviceProviderApplications)
        .values({ ...BASE_FIELDS, applicantUserId: userId, serviceCategoryId: categoryId })
        .returning({ id: serviceProviderApplications.id }),
    )
    expect(rows).toHaveLength(1)
  })

  it("rejects an insert naming a DEACTIVATED category — via RLS, not the CHECK constraint", async () => {
    const userId = await seedUser(handle)
    const inactiveCategoryId = await seedCategory(handle, userId, false)

    let caught: unknown
    try {
      await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({
          ...BASE_FIELDS,
          applicantUserId: userId,
          serviceCategoryId: inactiveCategoryId,
        }),
      )
    } catch (err) {
      caught = err
    }
    // 42501 = RLS policy violation. A 23514 here would mean the fixture is
    // malformed (missing category/description), not that the feature works.
    expect(pgErrorCode(caught)).toBe("42501")
  })

  it("rejects an insert trying to set status to 'approved' directly — via RLS, not the CHECK constraint", async () => {
    const userId = await seedUser(handle)

    let caught: unknown
    try {
      await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({
          ...BASE_FIELDS,
          applicantUserId: userId,
          status: "approved",
        }),
      )
    } catch (err) {
      caught = err
    }
    expect(pgErrorCode(caught)).toBe("42501")
  })

  it("rejects a second open application from the same account (race-safe duplicate prevention)", async () => {
    const userId = await seedUser(handle)

    const firstInsert = await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
      tx
        .insert(serviceProviderApplications)
        .values({ ...BASE_FIELDS, applicantUserId: userId })
        .returning({ id: serviceProviderApplications.id }),
    )
    // Assert the FIRST submission actually succeeded before asserting the
    // second is blocked — otherwise a silently-failed first insert would make
    // the "duplicate correctly blocked" assertion below pass for the wrong
    // reason (there'd be no prior row to duplicate against at all).
    expect(firstInsert).toHaveLength(1)

    let caught: unknown
    try {
      await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: userId }),
      )
    } catch (err) {
      caught = err
    }
    expect(pgErrorCode(caught)).toBe("23505")
  })

  it("rejects TWO CONCURRENT submissions from the same account — exactly one wins (genuine race, not sequential)", async () => {
    const userId = await seedUser(handle)

    const results = await Promise.allSettled([
      withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: userId }),
      ),
      withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: userId }),
      ),
    ])

    const fulfilled = results.filter((r) => r.status === "fulfilled")
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(pgErrorCode(rejected[0]!.reason)).toBe("23505")
  })

  it("the CHECK constraint rejects NULL category + empty description, even under withAdmin", async () => {
    const userId = await seedUser(handle)

    let caught: unknown
    try {
      await withAdmin(handle.db, { userId, reason: "test constraint" }, (tx) =>
        tx.insert(serviceProviderApplications).values({
          applicantUserId: userId,
          name: "Aisha",
          contactEmail: "aisha@example.com",
          contactNumber: "+60123456789",
          companyName: "Aisha Studio",
          serviceCategoryId: null,
          businessDescription: null,
        }),
      )
    } catch (err) {
      caught = err
    }
    expect(pgErrorCode(caught)).toBe("23514")
  })

  it("an applicant cannot see another applicant's row", async () => {
    const ownerId = await seedUser(handle)
    const otherId = await seedUser(handle)

    await withTenant(handle.db, { userId: ownerId, userRole: "buyer" }, (tx) =>
      tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: ownerId }),
    )

    const rows = await withTenant(handle.db, { userId: otherId, userRole: "buyer" }, (tx) =>
      tx
        .select()
        .from(serviceProviderApplications)
        .where(sql`${serviceProviderApplications.applicantUserId} = ${ownerId}`),
    )
    expect(rows).toHaveLength(0)
  })

  it("bomy_finance cannot see ANY application row; bomy_ops can see all", async () => {
    const applicantId = await seedUser(handle)
    const financeId = await seedUser(handle, "bomy_finance")
    const opsId = await seedUser(handle, "bomy_ops")

    await withTenant(handle.db, { userId: applicantId, userRole: "buyer" }, (tx) =>
      tx
        .insert(serviceProviderApplications)
        .values({ ...BASE_FIELDS, applicantUserId: applicantId }),
    )

    const financeRows = await withTenant(
      handle.db,
      { userId: financeId, userRole: "bomy_finance" },
      (tx) =>
        tx
          .select()
          .from(serviceProviderApplications)
          .where(sql`${serviceProviderApplications.applicantUserId} = ${applicantId}`),
    )
    expect(financeRows).toHaveLength(0)

    const opsRows = await withTenant(handle.db, { userId: opsId, userRole: "bomy_ops" }, (tx) =>
      tx
        .select()
        .from(serviceProviderApplications)
        .where(sql`${serviceProviderApplications.applicantUserId} = ${applicantId}`),
    )
    expect(opsRows).toHaveLength(1)
  })
})
```

- [ ] **Step 8: Run it to verify it fails**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 REDIS_URL=redis://:changeme_local@localhost:6379 pnpm --filter @bomy/db test service-provider-applications.test.ts --run`
Expected: FAIL — table `service_provider_applications` does not exist yet.

- [ ] **Step 9: Apply the migration**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db migrate`
Expected: `apply 0032_service_provider_applications ... done`

- [ ] **Step 10: Run the tests again to verify they pass**

Run the same command as Step 8.
Expected: PASS (all 8 tests).

- [ ] **Step 11: Run the grants test**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/db test grants.test.ts --run`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/db/src/schema/service_provider_applications.ts packages/db/src/schema/index.ts \
  packages/db/drizzle/0032_service_provider_applications.sql packages/db/scripts/migrate.mjs \
  packages/db/src/rls/policies.sql packages/db/tests/grants.test.ts \
  packages/db/tests/service-provider-applications.test.ts
git commit -m "feat(db): add service_provider_applications table with RLS"
```

---

### Task 3: Validator

**Files:**

- Create: `apps/web/src/lib/service-provider-application-schema.ts`
- Test: `apps/web/tests/lib/service-provider-application-schema.test.ts`

**Interfaces:**

- Produces: `validateServiceProviderApplication(raw: unknown): ServiceProviderApplicationValidation`, `type ServiceProviderApplicationInput`, `type ServiceProviderApplicationErrors`. Consumed by Task 6 (server action) and Task 8 (form component, for the type only).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/lib/service-provider-application-schema.test.ts
import { describe, expect, test } from "vitest"

import { validateServiceProviderApplication } from "@/lib/service-provider-application-schema"

const valid = {
  name: "Aisha Tan",
  contactEmail: "aisha@example.com",
  contactNumber: "+60123456789",
  companyName: "Aisha Studio",
  serviceCategoryId: "11111111-1111-1111-1111-111111111111",
  businessDescription: null,
}

describe("validateServiceProviderApplication", () => {
  test("accepts a valid application with a real category and no description", () => {
    const r = validateServiceProviderApplication(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.serviceCategoryId).toBe(valid.serviceCategoryId)
  })

  test("rejects 'Other' (null category) with an empty description", () => {
    const r = validateServiceProviderApplication({
      ...valid,
      serviceCategoryId: null,
      businessDescription: null,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.businessDescription).toBeTruthy()
  })

  test("accepts 'Other' (null category) WITH a non-empty description", () => {
    const r = validateServiceProviderApplication({
      ...valid,
      serviceCategoryId: null,
      businessDescription: "I design brand identities for local cafes.",
    })
    expect(r.ok).toBe(true)
  })

  test("rejects missing name", () => {
    const r = validateServiceProviderApplication({ ...valid, name: "" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.name).toBeTruthy()
  })

  test("rejects an invalid contact email", () => {
    const r = validateServiceProviderApplication({ ...valid, contactEmail: "not-an-email" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.contactEmail).toBeTruthy()
  })

  test("rejects a malformed serviceCategoryId (not a UUID)", () => {
    const r = validateServiceProviderApplication({ ...valid, serviceCategoryId: "not-a-uuid" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.serviceCategoryId).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bomy/web test service-provider-application-schema.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/service-provider-application-schema.ts
/**
 * Validator for the /provider/apply form. No Zod, matches the codebase
 * convention (see shipping-address-schema.ts): manual validation returning
 * { ok: true, value } or { ok: false, errors }.
 */

export type ServiceProviderApplicationInput = {
  name: string
  contactEmail: string
  contactNumber: string
  companyName: string
  serviceCategoryId: string | null
  businessDescription: string | null
}

export type ServiceProviderApplicationErrors = Partial<
  Record<keyof ServiceProviderApplicationInput, string>
>

export type ServiceProviderApplicationValidation =
  | { ok: true; value: ServiceProviderApplicationInput }
  | { ok: false; errors: ServiceProviderApplicationErrors }

const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateServiceProviderApplication(
  raw: unknown,
): ServiceProviderApplicationValidation {
  const errors: ServiceProviderApplicationErrors = {}
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: { name: "Application is missing" } }
  }
  const o = raw as Record<string, unknown>

  const name = typeof o["name"] === "string" ? o["name"].trim() : ""
  if (!name) errors.name = "Name is required"

  const contactEmail = typeof o["contactEmail"] === "string" ? o["contactEmail"].trim() : ""
  if (!contactEmail) errors.contactEmail = "Contact email is required"
  else if (!EMAIL_RE.test(contactEmail))
    errors.contactEmail = "Please provide a valid email address"

  const contactNumber = typeof o["contactNumber"] === "string" ? o["contactNumber"].trim() : ""
  if (!contactNumber) errors.contactNumber = "Contact number is required"

  const companyName = typeof o["companyName"] === "string" ? o["companyName"].trim() : ""
  if (!companyName) errors.companyName = "Company name is required"

  const categoryRaw =
    typeof o["serviceCategoryId"] === "string" ? o["serviceCategoryId"].trim() : ""
  const serviceCategoryId = categoryRaw.length > 0 ? categoryRaw : null
  if (serviceCategoryId !== null && !UUID_RE.test(serviceCategoryId)) {
    errors.serviceCategoryId = "Invalid category"
  }

  const descriptionRaw =
    typeof o["businessDescription"] === "string" ? o["businessDescription"].trim() : ""
  const businessDescription = descriptionRaw.length > 0 ? descriptionRaw : null

  // "Other" (no category) requires a description — mirrors the DB CHECK
  // constraint (0032) so this produces a friendly error, not a raw
  // constraint-violation 500.
  if (serviceCategoryId === null && businessDescription === null) {
    errors.businessDescription = 'Please describe your business, since you selected "Other"'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name,
      contactEmail,
      contactNumber,
      companyName,
      serviceCategoryId,
      businessDescription,
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bomy/web test service-provider-application-schema.test.ts --run`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/service-provider-application-schema.ts apps/web/tests/lib/service-provider-application-schema.test.ts
git commit -m "feat(web): add service-provider application validator"
```

---

### Task 4: Email notifications

**Files:**

- Create: `apps/web/src/notifications/service-provider-application.ts`
- Test: `apps/web/tests/notifications/service-provider-application.test.ts`

**Interfaces:**

- Produces: `sendApplicantAck(mailer: Mailer, application: { name: string; email: string }): Promise<void>`, `sendOpsAlert(mailer: Mailer, application: { applicationId: string; name: string; contactEmail: string; contactNumber: string; companyName: string; category: string }, env: { opsEmails: string[] }): Promise<void>`. Consumed by Task 6's server action. No `adminUrl` — admin review doesn't exist yet (spec §8), so there is nothing to link to; see Step 3.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/notifications/service-provider-application.test.ts
import { describe, expect, it, vi } from "vitest"

import type { Mailer } from "@bomy/mailer"

import {
  sendApplicantAck,
  sendOpsAlert,
} from "../../src/notifications/service-provider-application.js"

function makeMailer() {
  const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
  const close = vi.fn<Mailer["close"]>().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

describe("sendApplicantAck", () => {
  it("sends to exactly the given email — the caller decides which address that is", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, { name: "Aisha", email: "current-account-email@example.com" })
    expect(sendMail.mock.calls[0]![0].to).toBe("current-account-email@example.com")
  })
})

describe("sendOpsAlert", () => {
  it("sends to every ops email, with the applicant's typed contact email and category in the BODY — and no link, since admin review doesn't exist yet", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendOpsAlert(
      mailer,
      {
        applicationId: "app-1",
        name: "Aisha",
        contactEmail: "typed-contact@example.com",
        contactNumber: "+60123456789",
        companyName: "Aisha Studio",
        category: "Graphic Design",
      },
      { opsEmails: ["ops1@test.example", "ops2@test.example"] },
    )
    const call = sendMail.mock.calls[0]![0]
    expect(call.to).toEqual(["ops1@test.example", "ops2@test.example"])
    expect(call.text).toContain("typed-contact@example.com")
    expect(call.text).toContain("Aisha Studio")
    expect(call.text).toContain("Graphic Design")
    // No dead link to the not-yet-built admin review page (spec §8).
    expect(call.text).not.toContain("http")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bomy/web test service-provider-application.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/notifications/service-provider-application.ts
import type { Mailer } from "@bomy/mailer"

export async function sendApplicantAck(
  mailer: Mailer,
  application: { name: string; email: string },
): Promise<void> {
  await mailer.sendMail({
    to: application.email,
    subject: "We received your BOMY service provider application",
    text:
      `Hi ${application.name},\n\n` +
      `We've received your application to become a BOMY service provider. ` +
      `Our team will review it and contact you soon.\n\n` +
      `BOMY Team`,
  })
}

export async function sendOpsAlert(
  mailer: Mailer,
  application: {
    applicationId: string
    name: string
    contactEmail: string
    contactNumber: string
    companyName: string
    category: string
  },
  env: { opsEmails: string[] },
): Promise<void> {
  // No admin link — the admin review page doesn't exist yet (spec §8). Don't
  // invent a placeholder URL; a future admin-review PR adds a real link here
  // once that page exists (Charlie's review, 2026-09-29).
  await mailer.sendMail({
    to: env.opsEmails,
    subject: `[BOMY Ops] New service provider application — ${application.companyName}`,
    text:
      `New service provider application received.\n\n` +
      `Name:     ${application.name}\n` +
      `Email:    ${application.contactEmail}\n` +
      `Contact:  ${application.contactNumber}\n` +
      `Company:  ${application.companyName}\n` +
      `Category: ${application.category}`,
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bomy/web test service-provider-application.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/notifications/service-provider-application.ts apps/web/tests/notifications/service-provider-application.test.ts
git commit -m "feat(web): add service-provider application email notifications"
```

---

### Task 5: Protect `/provider` in middleware

**Files:**

- Modify: `apps/web/src/auth.config.ts:63-67`
- Modify: `apps/web/tests/auth/auth-config-authorized.test.ts`

**Interfaces:**

- No new exports — this only widens `authConfig.callbacks.authorized`'s existing `requiresLogin` check.

- [ ] **Step 1: Write the failing tests**

In `apps/web/tests/auth/auth-config-authorized.test.ts`, change the existing login-required-routes `it.each` array (in the `"authConfig.authorized — login-required routes"` describe block) from:

```ts
  it.each(["/account", "/dashboard", "/membership/manage", "/membership/success"])(
```

to:

```ts
  it.each(["/account", "/dashboard", "/membership/manage", "/membership/success", "/provider"])(
```

Then add this new test at the end of the `"authConfig.authorized — nested (prefix) route matching"` describe block:

```ts
it("blocks an anonymous visitor from a nested login-required route (/provider/apply)", () => {
  expect(authorize("/provider/apply", null)).toBe(false)
})

it("allows any consented, signed-in role into /provider/apply — no role restriction", () => {
  const seller: TestUser = { role: "seller_owner", consentVersion: TOS, currentTosVersion: TOS }
  expect(authorize("/provider/apply", seller)).toBe(true)
  expect(authorize("/provider/apply", consented)).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bomy/web test auth-config-authorized.test.ts --run`
Expected: FAIL — `/provider` is not yet gated, so `authorize("/provider", null)` currently returns `true`.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/auth.config.ts`, change:

```ts
const requiresLogin =
  nextUrl.pathname.startsWith("/account") ||
  nextUrl.pathname.startsWith("/dashboard") ||
  nextUrl.pathname.startsWith("/membership/manage") ||
  nextUrl.pathname.startsWith("/membership/success")
```

to:

```ts
const requiresLogin =
  nextUrl.pathname.startsWith("/account") ||
  nextUrl.pathname.startsWith("/dashboard") ||
  nextUrl.pathname.startsWith("/membership/manage") ||
  nextUrl.pathname.startsWith("/membership/success") ||
  nextUrl.pathname.startsWith("/provider")
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bomy/web test auth-config-authorized.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth.config.ts apps/web/tests/auth/auth-config-authorized.test.ts
git commit -m "feat(web): require sign-in on /provider routes"
```

---

### Task 6: Server action `submitProviderApplication`

**Files:**

- Modify: `apps/web/src/lib/rate-limits.ts` (add `serviceProviderApply` config)
- Create: `apps/web/src/app/provider/apply/actions.ts`
- Test: `apps/web/tests/provider-apply/actions.test.ts`

**Interfaces:**

- Consumes: `validateServiceProviderApplication` (Task 3), `sendApplicantAck`/`sendOpsAlert` (Task 4), `checkActionRateLimit`/`withTenant`/`schema` from `@bomy/db` (Tasks 1–2).
- Produces: `submitProviderApplication(formData: FormData): Promise<SubmitProviderApplicationResult>` where `SubmitProviderApplicationResult = { ok: true } | { ok: false; errors: ServiceProviderApplicationErrors & { form?: string } }`. Consumed by Task 8's client form.

- [ ] **Step 1: Add the rate-limit config**

In `apps/web/src/lib/rate-limits.ts`, add this entry to `ACTION_RATE_LIMITS` (right after `profileEdit`):

```ts
  /**
   * Low-frequency by nature — a real applicant submits once, maybe twice.
   * max is 10, not tighter, to leave headroom for Task 6's own test suite
   * (multiple submissions from the same seeded user inside one fixed window).
   */
  serviceProviderApply: { max: 10, windowMs: ONE_MINUTE_MS },
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/tests/provider-apply/actions.test.ts
/**
 * Integration tests — submitProviderApplication server action.
 *
 * Requires a live Postgres with bomy_app role and applied migrations
 * (0031, 0032). @/auth and the notification functions are mocked.
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { sendApplicantAckMock, sendOpsAlertMock } = vi.hoisted(() => ({
  sendApplicantAckMock: vi.fn(),
  sendOpsAlertMock: vi.fn(),
}))

vi.mock("@/notifications/service-provider-application", () => ({
  sendApplicantAck: sendApplicantAckMock,
  sendOpsAlert: sendOpsAlertMock,
}))

import { auth } from "@/auth"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

function makeFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const fd = new FormData()
  fd.set("name", overrides["name"] ?? "Aisha")
  fd.set("contactEmail", overrides["contactEmail"] ?? "typed-contact@example.com")
  fd.set("contactNumber", overrides["contactNumber"] ?? "+60123456789")
  fd.set("companyName", overrides["companyName"] ?? "Aisha Studio")
  fd.set("serviceCategoryId", overrides["serviceCategoryId"] ?? "")
  fd.set("businessDescription", overrides["businessDescription"] ?? "I design brand identities.")
  return fd
}

describe.skipIf(!shouldRun)("submitProviderApplication — server action", () => {
  let testDb: ReturnType<typeof makeDb>
  const createdUserIds: string[] = []

  // Every test seeds its OWN applicant — they must NOT share one. The table
  // allows only one open (pending/approved) application per account, so a
  // shared applicant across tests would make every test after the first
  // insert fail as a duplicate for a reason unrelated to what it's actually
  // testing (Charlie's review, 2026-09-29).
  async function seedApplicant(): Promise<{ userId: string; accountEmail: string }> {
    const userId = randomUUID()
    const accountEmail = `${userId}-real-account-email@test.bomy`
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values({ id: userId, email: accountEmail, role: "buyer" })
    })
    createdUserIds.push(userId)
    return { userId, accountEmail }
  }

  beforeAll(() => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      for (const id of createdUserIds) {
        await tx
          .delete(schema.serviceProviderApplications)
          .where(eq(schema.serviceProviderApplications.applicantUserId, id))
      }
    })
    await testDb.close()
  })

  beforeEach(() => {
    sendApplicantAckMock.mockReset().mockResolvedValue(undefined)
    sendOpsAlertMock.mockReset().mockResolvedValue(undefined)
    mockAuth.mockReset()
  })

  it("unauthenticated → returns a form error, inserts nothing", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue(null)
    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(makeFormData())
    expect(result.ok).toBe(false)

    // Read via withAdmin (bypasses RLS), not a raw app-role select. A raw
    // select with no tenant context set always returns zero rows under
    // default-deny RLS — whether or not a row secretly got inserted — so it
    // cannot actually prove "nothing was inserted" (Charlie's review,
    // 2026-09-29). This read can see the row if it's there, so a fail here
    // would be a real signal.
    const rows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test verify no insert" },
      (tx) =>
        tx
          .select()
          .from(schema.serviceProviderApplications)
          .where(eq(schema.serviceProviderApplications.applicantUserId, userId)),
    )
    expect(rows).toHaveLength(0)
  })

  it("valid submission → inserts a row and sends the ack to the REAL account email, not the session's stale one or the typed contact email", async () => {
    const { userId, accountEmail } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(makeFormData())
    expect(result).toEqual({ ok: true })

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendApplicantAckMock.mock.calls[0]![1]).toMatchObject({ email: accountEmail })
  })

  it("a second submission from the same account is rejected with a friendly 'already applied' error, not a 500", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const first = await submitProviderApplication(makeFormData())
    // The first submission must actually succeed — otherwise the "duplicate
    // correctly blocked" assertion below would pass for the wrong reason
    // (there'd be nothing to duplicate against).
    expect(first).toEqual({ ok: true })

    const second = await submitProviderApplication(makeFormData())
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.form).toBeTruthy()
  })

  it("two CONCURRENT submissions from the same account — exactly one succeeds (genuine race, not sequential awaits)", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const [a, b] = await Promise.all([
      submitProviderApplication(makeFormData()),
      submitProviderApplication(makeFormData()),
    ])

    const oks = [a, b].filter((r) => r.ok)
    const fails = [a, b].filter((r) => !r.ok)
    expect(oks).toHaveLength(1)
    expect(fails).toHaveLength(1)
  })

  it("naming a deactivated category is rejected with a field-level error, not a 500", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const categoryId = randomUUID()
    await withAdmin(testDb.db, { userId, reason: "test seed inactive category" }, async (tx) => {
      await tx
        .insert(schema.serviceCategories)
        .values({ id: categoryId, name: "Retired", slug: `retired-${categoryId}`, isActive: false })
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(
      makeFormData({ serviceCategoryId: categoryId, businessDescription: "" }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.serviceCategoryId).toBeTruthy()
  })

  it("'Other' with no description returns a validator error, no DB call at all", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(
      makeFormData({ serviceCategoryId: "", businessDescription: "" }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.businessDescription).toBeTruthy()
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 REDIS_URL=redis://:changeme_local@localhost:6379 pnpm --filter @bomy/web test provider-apply/actions.test.ts --run`
Expected: FAIL — `src/app/provider/apply/actions.ts` does not exist.

- [ ] **Step 4: Write the implementation**

```ts
// apps/web/src/app/provider/apply/actions.ts
"use server"

import { and, eq } from "drizzle-orm"
import { after } from "next/server"

import { checkActionRateLimit, makeDb, schema, withTenant } from "@bomy/db"
import { parseOpsEmails } from "@bomy/mailer"

import { auth } from "@/auth"
import { getMailer } from "@/lib/mailer"
import { ACTION_RATE_LIMITS, RATE_LIMIT_USER_MESSAGE } from "@/lib/rate-limits"
import {
  validateServiceProviderApplication,
  type ServiceProviderApplicationErrors,
} from "@/lib/service-provider-application-schema"
import { sendApplicantAck, sendOpsAlert } from "@/notifications/service-provider-application"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export type SubmitProviderApplicationResult =
  | { ok: true }
  | {
      ok: false
      errors: ServiceProviderApplicationErrors & {
        form?: string
        code?: "already_applied" | "rate_limited" | "inactive_category"
      }
    }

const INACTIVE_CATEGORY_CODE = "INACTIVE_CATEGORY"

function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  )
}

function isInactiveCategory(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === INACTIVE_CATEGORY_CODE
  )
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

export async function submitProviderApplication(
  formData: FormData,
): Promise<SubmitProviderApplicationResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, errors: { form: "Please sign in first." } }
  }
  const userId = session.user.id
  const userRole = session.user.role

  const limit = await checkActionRateLimit(
    getDb(),
    { userId, userRole },
    "service_provider_apply",
    ACTION_RATE_LIMITS.serviceProviderApply,
  )
  if (!limit.allowed) {
    return { ok: false, errors: { form: RATE_LIMIT_USER_MESSAGE, code: "rate_limited" } }
  }

  const categoryRaw = readFormString(formData, "serviceCategoryId")
  const validation = validateServiceProviderApplication({
    name: readFormString(formData, "name"),
    contactEmail: readFormString(formData, "contactEmail"),
    contactNumber: readFormString(formData, "contactNumber"),
    companyName: readFormString(formData, "companyName"),
    serviceCategoryId: categoryRaw.length > 0 ? categoryRaw : null,
    businessDescription: readFormString(formData, "businessDescription") || null,
  })
  if (!validation.ok) return { ok: false, errors: validation.errors }
  const input = validation.value

  try {
    const { applicationId, email, categoryLabel } = await withTenant(
      getDb(),
      { userId, userRole },
      async (tx) => {
        let categoryLabel = "Other"
        if (input.serviceCategoryId) {
          const [category] = await tx
            .select({ id: schema.serviceCategories.id, name: schema.serviceCategories.name })
            .from(schema.serviceCategories)
            .where(
              and(
                eq(schema.serviceCategories.id, input.serviceCategoryId),
                eq(schema.serviceCategories.isActive, true),
              ),
            )
          if (!category) {
            throw Object.assign(new Error("Category is no longer active"), {
              code: INACTIVE_CATEGORY_CODE,
            })
          }
          categoryLabel = category.name
        }

        const [inserted] = await tx
          .insert(schema.serviceProviderApplications)
          .values({
            applicantUserId: userId,
            name: input.name,
            contactEmail: input.contactEmail,
            contactNumber: input.contactNumber,
            companyName: input.companyName,
            serviceCategoryId: input.serviceCategoryId,
            businessDescription: input.businessDescription,
          })
          .returning({ id: schema.serviceProviderApplications.id })

        // Read the account's CURRENT email fresh from `users`, inside this same
        // transaction — never the session/JWT's cached claim, which can be
        // stale for up to 30 days or diverge if an admin changes the row after
        // sign-in (spec §6). This is the actual fix for that bug, not the mock
        // in the test alone.
        const [user] = await tx
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
        if (!user) throw new Error("submitProviderApplication: signed-in user row not found")

        return { applicationId: inserted!.id, email: user.email, categoryLabel }
      },
    )

    // Dispatch after the response returns: this is a request path (a server
    // action returning to the signed-in browser), so SMTP must never add to
    // the response latency, and neither email's outcome changes the
    // `{ ok: true }` returned below. A bare `void sendX(...).catch(log)` is
    // NOT enough on Vercel — once the response is sent, the invocation can be
    // frozen or torn down before an unawaited promise finishes (see
    // https://vercel.com/kb/guide/troubleshooting-inconsistent-logs-in-vercel-functions).
    // `after()` extends the invocation via `waitUntil` so the send actually
    // completes, matching the existing precedent in
    // seller/dashboard/products/actions.ts and .../settings/body-actions.ts.
    const mailer = getMailer()
    after(async () => {
      try {
        await sendApplicantAck(mailer, { name: input.name, email })
      } catch (err) {
        console.error({
          event: "email_notification_failed",
          recipientType: "applicant",
          applicationId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })

    const opsEmails = parseOpsEmails(process.env)
    if (opsEmails.length === 0) {
      console.info({
        event: "email_notification_skipped",
        reason: "missing_ops_recipients",
        applicationId,
      })
      return { ok: true }
    }

    after(async () => {
      try {
        await sendOpsAlert(
          mailer,
          {
            applicationId,
            name: input.name,
            contactEmail: input.contactEmail,
            contactNumber: input.contactNumber,
            companyName: input.companyName,
            category: categoryLabel,
            businessDescription: input.businessDescription,
          },
          { opsEmails },
        )
      } catch (err) {
        console.error({
          event: "email_notification_failed",
          recipientType: "ops",
          applicationId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })

    return { ok: true }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        errors: { form: "You already have an application on file.", code: "already_applied" },
      }
    }
    if (isInactiveCategory(err)) {
      return {
        ok: false,
        errors: {
          serviceCategoryId: "That category is no longer available. Please pick another.",
          code: "inactive_category",
        },
      }
    }
    throw err
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run the same command as Step 3.
Expected: PASS (6 tests).

- [ ] **Step 6: Run the scoped web suite to check for regressions**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 REDIS_URL=redis://:changeme_local@localhost:6379 pnpm --filter @bomy/web test --run`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/rate-limits.ts apps/web/src/app/provider/apply/actions.ts \
  apps/web/tests/provider-apply/actions.test.ts
git commit -m "feat(web): add submitProviderApplication server action"
```

---

### Task 7: Queries (active categories + existing-application check)

**Files:**

- Create: `apps/web/src/app/provider/apply/queries.ts`
- Test: `apps/web/tests/provider-apply/queries.test.ts`

**Interfaces:**

- Produces: `getActiveServiceCategories(userId: string, userRole: UserRole): Promise<Array<{ id: string; name: string }>>`, `getMyOpenApplication(userId: string, userRole: UserRole): Promise<{ status: "pending" | "approved" | "rejected" } | null>`. Consumed by Task 9's page.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/provider-apply/queries.test.ts
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("provider-apply queries", () => {
  let testDb: ReturnType<typeof makeDb>
  let userId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    userId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
    })
  })

  afterAll(async () => {
    await testDb.close()
  })

  it("getActiveServiceCategories returns only active categories, ordered by sortOrder", async () => {
    const activeId = randomUUID()
    const inactiveId = randomUUID()
    await withAdmin(testDb.db, { userId, reason: "test seed categories" }, async (tx) => {
      await tx.insert(schema.serviceCategories).values([
        { id: activeId, name: "Active", slug: `active-${activeId}`, isActive: true, sortOrder: 10 },
        {
          id: inactiveId,
          name: "Inactive",
          slug: `inactive-${inactiveId}`,
          isActive: false,
          sortOrder: 5,
        },
      ])
    })

    const { getActiveServiceCategories } = await import("../../src/app/provider/apply/queries.js")
    const rows = await getActiveServiceCategories(userId, "buyer")
    expect(rows.some((r) => r.id === activeId)).toBe(true)
    expect(rows.some((r) => r.id === inactiveId)).toBe(false)
  })

  it("getMyOpenApplication returns null when there is no application, then the row once one exists", async () => {
    const freshUserId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: freshUserId, email: `${freshUserId}@test.bomy`, role: "buyer" })
    })

    const { getMyOpenApplication } = await import("../../src/app/provider/apply/queries.js")
    expect(await getMyOpenApplication(freshUserId, "buyer")).toBeNull()

    await withAdmin(
      testDb.db,
      { userId: freshUserId, reason: "test seed application" },
      async (tx) => {
        await tx.insert(schema.serviceProviderApplications).values({
          applicantUserId: freshUserId,
          name: "Aisha",
          contactEmail: "aisha@example.com",
          contactNumber: "+60123456789",
          companyName: "Aisha Studio",
        })
      },
    )

    expect(await getMyOpenApplication(freshUserId, "buyer")).toEqual({ status: "pending" })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 REDIS_URL=redis://:changeme_local@localhost:6379 pnpm --filter @bomy/web test provider-apply/queries.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/app/provider/apply/queries.ts
import { and, eq, inArray } from "drizzle-orm"

import { makeDb, schema, withTenant, type UserRole } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function getActiveServiceCategories(
  userId: string,
  userRole: UserRole,
): Promise<Array<{ id: string; name: string }>> {
  return withTenant(getDb(), { userId, userRole }, (tx) =>
    tx
      .select({ id: schema.serviceCategories.id, name: schema.serviceCategories.name })
      .from(schema.serviceCategories)
      .where(eq(schema.serviceCategories.isActive, true))
      .orderBy(schema.serviceCategories.sortOrder),
  )
}

export async function getMyOpenApplication(
  userId: string,
  userRole: UserRole,
): Promise<{ status: "pending" | "approved" | "rejected" } | null> {
  const rows = await withTenant(getDb(), { userId, userRole }, (tx) =>
    tx
      .select({ status: schema.serviceProviderApplications.status })
      .from(schema.serviceProviderApplications)
      .where(
        and(
          eq(schema.serviceProviderApplications.applicantUserId, userId),
          inArray(schema.serviceProviderApplications.status, ["pending", "approved"]),
        ),
      )
      .limit(1),
  )
  return rows[0] ?? null
}
```

- [ ] **Step 4: Run to verify it passes**

Run the same command as Step 2.
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/provider/apply/queries.ts apps/web/tests/provider-apply/queries.test.ts
git commit -m "feat(web): add provider-apply page queries"
```

---

### Task 8: Client form component

**Files:**

- Create: `apps/web/src/app/provider/apply/provider-apply-form.tsx`
- Test: `apps/web/tests/provider-apply/provider-apply-form.test.tsx`

**Interfaces:**

- Consumes: `submitProviderApplication` (Task 6).
- Produces: `ProviderApplyForm({ categories }: { categories: ServiceCategoryOption[] })`, `type ServiceCategoryOption = { id: string; name: string }`. Consumed by Task 9's page.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/tests/provider-apply/provider-apply-form.test.tsx
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProviderApplyForm } from "@/app/provider/apply/provider-apply-form"

const CATEGORIES = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Graphic Design" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Videography" },
]

describe("ProviderApplyForm", () => {
  it("renders one <option> per category plus a trailing 'Other' option", () => {
    const html = renderToStaticMarkup(<ProviderApplyForm categories={CATEGORIES} />)
    expect(html).toContain("Graphic Design")
    expect(html).toContain("Videography")
    expect(html).toContain(">Other<")
  })

  it("with a real category preselected, the description is optional", () => {
    const html = renderToStaticMarkup(<ProviderApplyForm categories={CATEGORIES} />)
    expect(html).toContain("(optional)")
    expect(html).not.toMatch(/id="businessDescription"[^>]*required/)
  })

  it("with no categories seeded at all, 'Other' is the only choice, so the description is required", () => {
    const html = renderToStaticMarkup(<ProviderApplyForm categories={[]} />)
    expect(html).not.toContain("(optional)")
    expect(html).toMatch(/id="businessDescription"[^>]*required/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bomy/web test provider-apply-form.test.tsx --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/app/provider/apply/provider-apply-form.tsx
"use client"

import { type FormEvent, useActionState, useEffect, useState, useTransition } from "react"
import { Send } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { submitProviderApplication, type SubmitProviderApplicationResult } from "./actions"

export type ServiceCategoryOption = { id: string; name: string }

const OTHER_VALUE = "__other__"

async function formAction(
  _prev: SubmitProviderApplicationResult | null,
  formData: FormData,
): Promise<SubmitProviderApplicationResult> {
  try {
    return await submitProviderApplication(formData)
  } catch {
    return { ok: false, errors: { form: "We couldn't submit your application. Please try again." } }
  }
}

export function ProviderApplyForm({ categories }: { categories: ServiceCategoryOption[] }) {
  const [state, action, pending] = useActionState(formAction, null)
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [categoryChoice, setCategoryChoice] = useState<string>(categories[0]?.id ?? OTHER_VALUE)
  const isOther = categoryChoice === OTHER_VALUE

  useEffect(() => {
    if (!state) return
    if (state.ok) {
      toast.success("Application submitted — we'll be in touch soon.")
      return
    }
    if (state.errors.form) toast.error(state.errors.form)
  }, [state, toast])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("serviceCategoryId", isOther ? "" : categoryChoice)
    startTransition(() => action(formData))
  }

  if (state?.ok) {
    return (
      <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border text-center">
        <h1 className="text-lg font-semibold text-foreground">Application submitted!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Our team will review your application and contact you soon.
        </p>
      </div>
    )
  }

  const errors = state && !state.ok ? state.errors : undefined

  return (
    <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Become a Service Provider</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Offer your services to BOMY sellers. Fill in the form and our team will be in touch.
      </p>

      {errors?.form && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name" className="mb-1 block text-sm font-medium">
            Full Name *
          </Label>
          <Input id="name" name="name" required />
          {errors?.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
        </div>
        <div>
          <Label htmlFor="contactEmail" className="mb-1 block text-sm font-medium">
            Contact Email *
          </Label>
          <Input id="contactEmail" name="contactEmail" type="email" required />
          {errors?.contactEmail && (
            <p className="mt-1 text-sm text-destructive">{errors.contactEmail}</p>
          )}
        </div>
        <div>
          <Label htmlFor="contactNumber" className="mb-1 block text-sm font-medium">
            Contact Number *
          </Label>
          <Input
            id="contactNumber"
            name="contactNumber"
            type="tel"
            required
            placeholder="+60 12-345 6789"
          />
          {errors?.contactNumber && (
            <p className="mt-1 text-sm text-destructive">{errors.contactNumber}</p>
          )}
        </div>
        <div>
          <Label htmlFor="companyName" className="mb-1 block text-sm font-medium">
            Company Name *
          </Label>
          <Input id="companyName" name="companyName" required />
          {errors?.companyName && (
            <p className="mt-1 text-sm text-destructive">{errors.companyName}</p>
          )}
        </div>
        <div>
          <Label htmlFor="serviceCategoryChoice" className="mb-1 block text-sm font-medium">
            Service Category *
          </Label>
          <select
            id="serviceCategoryChoice"
            name="serviceCategoryChoice"
            required
            value={categoryChoice}
            onChange={(e) => setCategoryChoice(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={OTHER_VALUE}>Other</option>
          </select>
          {errors?.serviceCategoryId && (
            <p className="mt-1 text-sm text-destructive">{errors.serviceCategoryId}</p>
          )}
        </div>
        <div>
          <Label htmlFor="businessDescription" className="mb-1 block text-sm font-medium">
            Describe your business{" "}
            {isOther ? "*" : <span className="text-muted-foreground font-normal">(optional)</span>}
          </Label>
          <Textarea
            id="businessDescription"
            name="businessDescription"
            rows={3}
            required={isOther}
            placeholder="Tell us about the services you offer..."
          />
          {errors?.businessDescription && (
            <p className="mt-1 text-sm text-destructive">{errors.businessDescription}</p>
          )}
        </div>

        <Button type="submit" icon={<Send />} disabled={pending} className="w-full">
          {pending ? "Submitting…" : "Submit Application"}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run the same command as Step 2.
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/provider/apply/provider-apply-form.tsx apps/web/tests/provider-apply/provider-apply-form.test.tsx
git commit -m "feat(web): add ProviderApplyForm client component"
```

---

### Task 9: Page wiring + manual verification

**Files:**

- Create: `apps/web/src/app/provider/apply/page.tsx`

**Interfaces:**

- Consumes: `getActiveServiceCategories`/`getMyOpenApplication` (Task 7), `ProviderApplyForm` (Task 8), `auth` from `@/auth`.
- Produces: the `/provider/apply` route itself — nothing downstream consumes this file.

- [ ] **Step 1: Write the page**

```tsx
// apps/web/src/app/provider/apply/page.tsx
import { redirect } from "next/navigation"

import { auth } from "@/auth"

import { getActiveServiceCategories, getMyOpenApplication } from "./queries"
import { ProviderApplyForm } from "./provider-apply-form"

export default async function ProviderApplyPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/provider/apply")

  const userId = session.user.id
  const userRole = session.user.role

  const existing = await getMyOpenApplication(userId, userRole)
  if (existing) {
    return (
      <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
        <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border text-center">
          <h1 className="text-lg font-semibold text-foreground">You already applied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Status: {existing.status}. Our team will follow up soon.
          </p>
        </div>
      </main>
    )
  }

  const categories = await getActiveServiceCategories(userId, userRole)

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
      <ProviderApplyForm categories={categories} />
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint the whole feature**

Run: `pnpm --filter @bomy/web typecheck && pnpm --filter @bomy/web lint`
Expected: no errors.

- [ ] **Step 3: Manual verification — unauthenticated redirect**

Start the stack (`docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d`, then `pnpm --filter @bomy/db migrate`, then `pnpm dev`). With no session cookie:

Run: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/provider/apply`
Expected: a redirect toward `/auth/sign-in` (mirrors the existing `/account/addresses` unauthenticated check used in PR #127).

- [ ] **Step 4: Manual verification — signed-in happy path**

Sign in as a real local test user in the browser, visit `http://localhost:3000/provider/apply`, and confirm:

- The category dropdown lists the 5 seeded categories plus "Other".
- Selecting "Other" makes the description textarea required (this dynamic toggle isn't covered by Task 8's static-markup test — verify it live, the same way PR #127/#145 verified dynamic UI behavior in-browser).
- Submitting a valid application shows the "Application submitted!" state, and a second visit to `/provider/apply` shows "You already applied — Status: pending" instead of the form.
- Check Mailhog (`http://localhost:8025` or your local compose's mail UI) for the two dispatched emails.

- [ ] **Step 5: Run the full integration suite**

Run: `pnpm test:integration`
Expected: all suites green, including every test added in Tasks 1–8.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/provider/apply/page.tsx
git commit -m "feat(web): add /provider/apply page"
```

---

## Self-Review Notes

- **Spec coverage:** §3 (both tables) → Tasks 1–2. §4 (RLS) → Tasks 1–2. §5 (auth flow/route/no Turnstile/rate limit) → Tasks 5–6, 9. §6 (email, fresh `users.email` read) → Tasks 4, 6. §7 (testing list) → every task's own test step maps 1:1 to a spec §7 bullet. §8 (deferred) → deliberately no task exists for admin review, the directory, or category admin CRUD. §9 (open items) → the starter category list is fixed in Task 1 Step 3 (Charlie can edit via a follow-up migration); the route name `/provider/apply` is used throughout. Task 0 (branch creation) is plan-only hygiene with no spec section — it exists because the repo starts on `main` with no PR open.
- **Placeholder scan:** none found — every step has real, complete code or an exact shell command.
- **Type consistency:** `SubmitProviderApplicationResult`'s `errors` shape (`ServiceProviderApplicationErrors & { form?: string }`) is defined once in Task 6 and used identically in Task 8. `ServiceCategoryOption` is defined in Task 8 and matches the return shape of Task 7's `getActiveServiceCategories`. Column names match between the Task 1/2 Drizzle schemas and every raw-SQL migration. `sendOpsAlert`'s signature (Task 4: `application` now includes `category: string`; `env` is now just `{ opsEmails: string[] }`, no `adminUrl`) matches its one call site exactly (Task 6, which resolves `categoryLabel` from the same category lookup that already checks `isActive`).
- **Review Focus:** all 5 items are each covered by at least one concrete assertion (see the Review Focus section above for the exact task/test mapping). Items 1 and 2 are now each covered by both a sequential-rejection test AND a genuine concurrent (`Promise.allSettled`/`Promise.all`) test, in both Task 2 (DB layer) and Task 6 (action layer) — the plan previously claimed concurrency testing without actually exercising it.
- **Charlie's 2026-09-29 review, applied:** (1) Task 0 added — branch created and verified before any file changes, plus a Global Constraints line requiring every task's commit step to re-verify the branch. (2) Task 2's fixtures all now satisfy the CHECK constraint via a shared `BASE_FIELDS` object with a non-empty description, so each test fails/succeeds for the one specific reason it targets, verified by asserting the actual Postgres SQLSTATE (`42501` RLS / `23514` CHECK / `23505` unique) rather than "it threw." (3) Task 6's unauthenticated test now reads via `withAdmin` instead of a blind app-role select that could never have proven anything; every Task 6 test now seeds its own isolated applicant instead of sharing one; the duplicate test now asserts the first submission actually succeeded; a genuine concurrent-submission test was added to both Task 2 and Task 6. (4) **SUPERSEDED (Bob's PR #147 review, 2026-09-29) — do not treat this point as current.** It
  originally claimed both emails should stay `await`ed with per-recipient try/catch, matching the real
  `seller/apply` precedent exactly, and that the _spec's_ then-current claim (`void` fire-and-forget)
  was the actual error. That claim was itself wrong: `seller/apply`'s own action returns `{ ok: true }`
  unconditionally regardless of either email's outcome, so awaiting it never bought anything but
  latency — the same is true here. The dispatch mechanism was fixed twice more after this note was
  written: first (Bob's review round 1) to bare `void sendX(...).catch(log)`, then (round 2, after Bob
  caught that bare `void` isn't safe on a Vercel serverless invocation) to `after(async () => { try {
await sendX(...) } catch (err) { log } })` from `next/server` — the form actually shipped in Task 6's
  code block above and in `apps/web/src/app/provider/apply/actions.ts`. See spec §6's own
  "Correction history" note for the full chain. The dead-admin-review-link removal and `category`-field
  addition described in this point are unaffected and still accurate.
