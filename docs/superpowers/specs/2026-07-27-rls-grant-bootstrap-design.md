# GAPS #16 — `bomy_app` grant-bootstrap reproducibility: design

**Status:** design pass, not implemented. Do not edit code from this doc until Bob has reviewed.
**Model:** Sonnet 5 for research/verification, Opus (via Plan agent) for the design synthesis in
§§2-5 — per `CLAUDE.md` model routing, RLS policy design defaults to Opus. All empirical claims in
this document were independently verified by the Sonnet session against the live local Postgres
before being included here (see verification notes inline).

---

## 1. Grant Inventory

### 1.1 Grants declared in numbered migrations

Every migration from `0002` onward self-grants its own new table(s) in the same file that creates
the table. `0000`/`0001` do not.

| Table                                                                                                          | Introduced in | Grant in that migration                              |
| -------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| `users`, `stores`, `ledger_entries`, `platform_config`, `platform_config_audit`                                | 0000          | **NONE**                                             |
| `accounts`, `sessions`, `verification_tokens`                                                                  | 0001          | **NONE** (no RLS either, by design)                  |
| `seller_inquiries`                                                                                             | 0002          | `SELECT, INSERT, UPDATE, DELETE` (no RLS, by design) |
| `member_subscriptions`, `brand_subscription_plans`, `brand_subscriptions`, `vouchers`, `goodie_box_dispatches` | 0003          | `SELECT, INSERT, UPDATE, DELETE` each                |
| `admin_bypass_audit`                                                                                           | 0008          | `SELECT, INSERT, UPDATE, DELETE`                     |
| `categories`, `products`, `product_variants`, `product_images`                                                 | 0009          | `SELECT, INSERT, UPDATE, DELETE` each                |
| `checkout_sessions`, `checkout_session_items`, `checkout_session_stores`, `inventory_reservations`             | 0011          | `SELECT, INSERT, UPDATE, DELETE` each                |
| `orders`, `order_items`, `order_payouts`, `processed_webhook_events`                                           | 0012          | `SELECT, INSERT, UPDATE, DELETE` each                |
| `user_consents`                                                                                                | 0014          | `SELECT, INSERT` only                                |
| `user_addresses`                                                                                               | 0015          | `SELECT, INSERT, UPDATE, DELETE`                     |
| `duplicate_charges`                                                                                            | 0016          | `SELECT, INSERT, UPDATE, DELETE`                     |
| `body_image_upload_log`                                                                                        | 0021          | `SELECT, INSERT, DELETE` only                        |
| `store_categories`                                                                                             | 0025          | `SELECT, INSERT, UPDATE, DELETE`                     |
| `store_category_assignments`                                                                                   | 0025          | `SELECT, INSERT, DELETE` only                        |
| `action_rate_limits`                                                                                           | 0026          | `SELECT, INSERT, UPDATE, DELETE`                     |

### 1.2 The wildcard grant — three locations, byte-identical, none a tracked migration

```sql
GRANT USAGE ON SCHEMA public TO bomy_app;
GRANT USAGE ON SCHEMA app TO bomy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bomy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bomy_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO bomy_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bomy_app;
```

- `packages/db/src/rls/policies.sql` lines 436-441 (§6)
- `.github/workflows/ci.yml` lines 109-114 (inline `psql`, runs after `pnpm migrate`, every CI run)
- `docs/runbooks/public-deployment-cutover.md` lines 60-67 (manual runbook step, PR #39 era —
  almost certainly how Neon prod actually got bootstrapped)

### 1.3 Empirical reproduction (actually run, not inferred)

Built a throwaway Postgres database, replayed all 27 migrations via
`node packages/db/scripts/migrate.mjs`, queried `bomy_app` privileges before and after applying
the wildcard SQL above.

**After `migrate` alone:** exactly these 8 tables have zero privileges for `bomy_app`
(`SELECT=INSERT=UPDATE=DELETE=false`): `users`, `stores`, `ledger_entries`, `platform_config`,
`platform_config_audit`, `accounts`, `sessions`, `verification_tokens`. Every other table already
has whatever its own migration granted, exactly matching §1.1.

**After the wildcard on top:** the 8 tables above jump to full CRUD. Additionally, three tables
whose own migrations deliberately granted narrower than full CRUD get silently widened:

| Table                        | Migration grants         | Wildcard adds      |
| ---------------------------- | ------------------------ | ------------------ |
| `user_consents`              | `SELECT, INSERT`         | `UPDATE`, `DELETE` |
| `body_image_upload_log`      | `SELECT, INSERT, DELETE` | `UPDATE`           |
| `store_category_assignments` | `SELECT, INSERT, DELETE` | `UPDATE`           |

On the long-lived local dev Docker volume, these three currently show **no** overgrant (privileges
match their migration exactly) — the volume's wildcard step apparently ran before these later
tables (0014/0021/0025) existed, and `GRANT ... ON ALL TABLES` only affects tables that exist at
the time it runs (no `ALTER DEFAULT PRIVILEGES` exists anywhere — confirmed, `pg_default_acl` is
empty). **CI's sequence is `migrate` (creates everything) then wildcard — so CI reproduces the
overgrant on every single run, today, live.** Prod's actual state is unverifiable from here but
the runbook step ran during the PR #39 cutover, after most/all these migrations already existed —
likely the same overgrant.

### 1.4 Schema / sequence / function grants (verified via direct query)

- Schema `app`: `bomy_app` has explicit `USAGE` (`pg_namespace.nspacl`: `bomy_app=U/bomy`).
- Schema `public`: `bomy_app` has explicit `USAGE` recorded, partially redundant with Postgres's
  default-`PUBLIC`-USAGE-on-`public`-schema behavior, but present regardless.
- Sequences: **zero app-relevant sequences exist** — all PKs are `gen_random_uuid()`. Only
  `_bomy_migrations_id_seq` (internal, owner-only) exists; the wildcard currently grants `bomy_app`
  `USAGE, SELECT` on it, which is itself a minor overgrant on migration-tracking state.
- Functions in schema `app` (`assert_tenant_context`, `current_user_id`, `current_user_role`,
  `is_admin_bypass`, `is_bomy_staff`): all 5 have an explicit `bomy_app=X` EXECUTE ACL entry
  (`pg_proc.proacl`), confirming the wildcard's function grant did apply at some point. RLS
  `USING`/`WITH CHECK` clauses call these as `bomy_app`, so `EXECUTE` + schema `app` `USAGE` are
  load-bearing for every RLS-gated query. Schema `public` has zero custom functions today.

### 1.5 Two additional findings surfaced during the design pass (not part of the original ask, load-bearing)

**Finding A — the wildcard is currently hiding a real, live bug.** `users` has no DELETE policy
(only `users_self_read`/SELECT, `users_self_update`/UPDATE, `users_insert_staff_only`/INSERT), but
the wildcard grants DELETE. Under FORCE RLS with a grant present but no permissive policy for that
verb, a DELETE statement is **not an error — it silently affects zero rows.** Verified directly:

```
docker exec -i bomy_postgres psql -U bomy_app -d bomy <<'EOF'
BEGIN;
SET LOCAL app.current_user_id = '00000000-0000-0000-0000-000000000001';
SET LOCAL app.bypass_rls = 'true';
DELETE FROM users WHERE id = '<a real, existing row's id>';
ROLLBACK;
EOF
-- → "DELETE 0" (not an error), even with bypass_rls set and a real matching row
```

Test teardown across the repo does `tx.delete(schema.users)` believing it cleans up. It does not.
Verified on the live local dev DB: **13,480 total users, 11,435 matching `%@test.bomy`** —
orphaned rows accumulated across sessions because every teardown delete has been silently failing.
The same silent-no-op pattern exists for `ledger_entries` (3 test files), `processed_webhook_events`
(4), `admin_bypass_audit` (4, corrected from the design agent's initial estimate of 3),
`brand_subscription_plans` (5, corrected from ~6). File counts independently verified by grep,
excluding a stale `.claude/worktrees/` leftover directory that isn't part of the working tree.
Confirmed zero application (non-test) code deletes any of these 5 tables — the blast radius is
entirely test teardown, not product features.

**Finding B — the repo already documented this exact class of drift and worked around it instead
of fixing it.** `apps/web/tests/auth/consent/actions.test.ts:113-118` (verified verbatim):

```ts
// Attempt delete as tenant. Two outcomes depending on environment:
// - bomy_app lacks DELETE privilege (local): throws "permission denied"
// - bomy_app has DELETE privilege but no PERMISSIVE DELETE RLS policy (CI):
//   FORCE RLS silently returns 0 rows — no error, no rows removed.
// Either way the invariant holds: the row must still exist.
```

A test was written to tolerate CI-vs-local grant divergence for `user_consents` rather than fix
the divergence. This migration makes that test's behavior deterministic (see §3.1).

---

## 2. Target Least-Privilege Matrix

**Notation:** `S/I/U/D` = SELECT/INSERT/UPDATE/DELETE. "Policy verbs" = the union of `FOR` clauses
across permissive policies on that table (`FOR ALL` expands to S/I/U/D). RESTRICTIVE
`*_default_deny` policies are ignored here — they subtract, never add.

**Governing rule:** target grant = exactly the set of policy verbs. A grant wider than the policy
set is inert against RLS but not harmless — it converts "permission denied" into "silently
affected 0 rows" (Finding A). A grant narrower than the policy set is a latent outage.

Source-of-truth column: **0027 owns the whole matrix as a declarative snapshot** (see §3 for why);
the origin migration is noted for provenance.

| #   | Table                                                                                                                             | Policy verbs (today)                                                                     | Target grant                                                    | Source of truth     | REVOKE needed?                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `users`                                                                                                                           | S, U, I                                                                                  | **S, I, U**                                                     | 0027 (origin: none) | **Yes — DELETE**                                                                                                                                                 |
| 2   | `stores`                                                                                                                          | S, U, I + `stores_staff_all` FOR ALL                                                     | S, I, U, D                                                      | 0027 (origin: none) | No                                                                                                                                                               |
| 3   | `ledger_entries`                                                                                                                  | S, I                                                                                     | **S, I**                                                        | 0027 (origin: none) | **Yes — UPDATE, DELETE**                                                                                                                                         |
| 4   | `platform_config`                                                                                                                 | S + `staff_write` FOR ALL                                                                | S, I, U, D                                                      | 0027 (origin: none) | No                                                                                                                                                               |
| 5   | `platform_config_audit`                                                                                                           | S, I                                                                                     | **S, I**                                                        | 0027 (origin: none) | **Yes — UPDATE, DELETE**                                                                                                                                         |
| 6   | `accounts`                                                                                                                        | no RLS — adapter contract, verified against `@auth/drizzle-adapter@1.11.2` source        | **S, I, D**                                                     | 0027 (origin: none) | **Yes — UPDATE** (currently zero-grant, but the wildcard would add full CRUD like the other 7 zero-grant tables; 0027 must not follow the wildcard's shape here) |
| 7   | `sessions`                                                                                                                        | no RLS — adapter implements full CRUD; not invoked under `session.strategy: "jwt"` today | S, I, U, D                                                      | 0027 (origin: none) | No                                                                                                                                                               |
| 8   | `verification_tokens`                                                                                                             | no RLS — adapter contract, verified against source                                       | **S, I, D**                                                     | 0027 (origin: none) | **Yes — UPDATE** (same reasoning as `accounts`)                                                                                                                  |
| 9   | `seller_inquiries`                                                                                                                | no RLS by design; admin app deletes                                                      | S, I, U, D                                                      | 0002 (restated)     | No                                                                                                                                                               |
| 10  | `member_subscriptions`                                                                                                            | S + `staff_write` FOR ALL                                                                | S, I, U, D                                                      | 0003 (restated)     | No                                                                                                                                                               |
| 11  | `brand_subscription_plans`                                                                                                        | S, I, U                                                                                  | **S, I, U**                                                     | 0027 (origin: 0003) | **Yes — DELETE**                                                                                                                                                 |
| 12  | `brand_subscriptions`                                                                                                             | S + FOR ALL                                                                              | S, I, U, D                                                      | 0003 (restated)     | No                                                                                                                                                               |
| 13  | `vouchers`                                                                                                                        | S + FOR ALL                                                                              | S, I, U, D                                                      | 0003 (restated)     | No                                                                                                                                                               |
| 14  | `goodie_box_dispatches`                                                                                                           | S + FOR ALL                                                                              | S, I, U, D                                                      | 0003 (restated)     | No                                                                                                                                                               |
| 15  | `admin_bypass_audit`                                                                                                              | S, I                                                                                     | **S, I**                                                        | 0027 (origin: 0008) | **Yes — UPDATE, DELETE**                                                                                                                                         |
| 16  | `categories`                                                                                                                      | S, I, U, D (+0019 seller SELECT)                                                         | S, I, U, D                                                      | 0009 (restated)     | No                                                                                                                                                               |
| 17  | `products`                                                                                                                        | S, I, U, D                                                                               | S, I, U, D                                                      | 0009 (restated)     | No                                                                                                                                                               |
| 18  | `product_variants`                                                                                                                | S, I, U, D                                                                               | S, I, U, D                                                      | 0009 (restated)     | No                                                                                                                                                               |
| 19  | `product_images`                                                                                                                  | S, I, U, D                                                                               | S, I, U, D                                                      | 0009 (restated)     | No                                                                                                                                                               |
| 20  | `checkout_sessions`                                                                                                               | S, I, U, D                                                                               | S, I, U, D                                                      | 0011 (restated)     | No                                                                                                                                                               |
| 21  | `checkout_session_items`                                                                                                          | S, I, U, D                                                                               | S, I, U, D                                                      | 0011 (restated)     | No                                                                                                                                                               |
| 22  | `checkout_session_stores`                                                                                                         | S, I, U, D                                                                               | S, I, U, D                                                      | 0011 (restated)     | No                                                                                                                                                               |
| 23  | `inventory_reservations`                                                                                                          | S, I, U, D                                                                               | S, I, U, D                                                      | 0011 (restated)     | No                                                                                                                                                               |
| 24  | `orders`                                                                                                                          | S, I, U, D                                                                               | S, I, U, D                                                      | 0012 (restated)     | No                                                                                                                                                               |
| 25  | `order_items`                                                                                                                     | S, I, U, D                                                                               | S, I, U, D                                                      | 0012 (restated)     | No                                                                                                                                                               |
| 26  | `order_payouts`                                                                                                                   | S, I, U, D                                                                               | S, I, U, D                                                      | 0012 (restated)     | No                                                                                                                                                               |
| 27  | `processed_webhook_events`                                                                                                        | S, I                                                                                     | **S, I**                                                        | 0027 (origin: 0012) | **Yes — UPDATE, DELETE**                                                                                                                                         |
| 28  | `user_consents`                                                                                                                   | S, I                                                                                     | **S, I**                                                        | 0014 (restated)     | **Yes — UPDATE, DELETE** (CI-live today)                                                                                                                         |
| 29  | `user_addresses`                                                                                                                  | S, I, U, D                                                                               | S, I, U, D                                                      | 0015 (restated)     | No                                                                                                                                                               |
| 30  | `duplicate_charges`                                                                                                               | S, I, U                                                                                  | **S, I, U**                                                     | 0027 (origin: 0016) | **Yes — DELETE**                                                                                                                                                 |
| 31  | `body_image_upload_log`                                                                                                           | S, I, D                                                                                  | **S, I, D**                                                     | 0021 (restated)     | **Yes — UPDATE** (CI-live today)                                                                                                                                 |
| 32  | `store_categories`                                                                                                                | S, I, U, D                                                                               | S, I, U, D                                                      | 0025 (restated)     | No                                                                                                                                                               |
| 33  | `store_category_assignments`                                                                                                      | S, I, D                                                                                  | **S, I, D**                                                     | 0025 (restated)     | **Yes — UPDATE** (CI-live today)                                                                                                                                 |
| 34  | `action_rate_limits`                                                                                                              | S, I, U, D                                                                               | S, I, U, D                                                      | 0026 (restated)     | No                                                                                                                                                               |
| —   | Schema `public`                                                                                                                   | n/a                                                                                      | `USAGE`                                                         | 0027                | No                                                                                                                                                               |
| —   | Schema `app`                                                                                                                      | n/a                                                                                      | `USAGE`                                                         | 0027                | No                                                                                                                                                               |
| —   | Functions `app.current_user_id`, `app.current_user_role`, `app.is_bomy_staff`, `app.is_admin_bypass`, `app.assert_tenant_context` | called from every USING/WITH CHECK clause                                                | `EXECUTE` on each, **named explicitly**, not `ON ALL FUNCTIONS` | 0027                | No                                                                                                                                                               |
| —   | Functions in schema `public`                                                                                                      | none exist                                                                               | no grant                                                        | —                   | No                                                                                                                                                               |
| —   | Sequences in schema `public`                                                                                                      | none app-relevant                                                                        | no grant                                                        | —                   | **Yes** — drop the wildcard's `_bomy_migrations_id_seq` overgrant                                                                                                |

### 2.1 Explicit calls on the contested rows

**`accounts` / `sessions` / `verification_tokens` — source of truth is the Auth.js adapter
contract, not policy verbs, since these tables carry no RLS.** Read the actual installed adapter
(`@auth/drizzle-adapter@1.11.2`, `lib/pg.js` — not assumed, the source was read directly) rather
than inferring from method names:

- **`accounts`: target S, I, D — drop UPDATE.** The adapter implements exactly `linkAccount`
  (INSERT), `getUserByAccount`/`getAccount` (SELECT), `unlinkAccount` (DELETE). **There is no
  `updateAccount` method anywhere in the adapter** — OAuth token refresh is not something this
  adapter version handles via UPDATE. Confirmed zero UPDATE against `accounts` anywhere else in
  the codebase either (grepped `apps/*/src`, `packages/*/src`). Currently zero-grant, so this
  needs an explicit narrower target in 0027 rather than following the wildcard's shape (which
  would hand it full CRUD like the other 7 zero-grant tables).
- **`verification_tokens`: target S, I, D — drop UPDATE, but keep SELECT.** The adapter implements
  `createVerificationToken` (INSERT) and `useVerificationToken` (a single
  `DELETE ... WHERE identifier = $1 AND token = $2 RETURNING *` — no separate read call, no
  `updateVerificationToken` method exists). The naive read of that is "consume-and-delete needs
  only I+D, no S." **That's wrong, and worth stating precisely because it's not obvious:**
  PostgreSQL requires `SELECT` privilege on any column referenced in a `DELETE`'s `WHERE` clause,
  independent of `RETURNING`. Verified empirically — a role granted only `INSERT, DELETE` (no
  `SELECT`) on a test table gets `permission denied for table` on a plain
  `DELETE ... WHERE id = $1`, before `RETURNING` is even a factor:
  ```
  GRANT INSERT, DELETE ON probe_returning TO probe_role_norights;  -- no SELECT
  SET ROLE probe_role_norights;
  DELETE FROM probe_returning WHERE id = 1;
  -- ERROR: permission denied for table probe_returning
  ```
  So `verification_tokens` needs `SELECT` for the `WHERE identifier = $1 AND token = $2` clause to
  evaluate at all, even though the adapter never issues a bare `SELECT` against it directly. Target
  is `S, I, D`.
- **`sessions`: target S, I, U, D — unchanged, full CRUD.** The adapter implements all four
  operations (`createSession`, `getSessionAndUser`, `updateSession`, `deleteSession`). Under this
  project's `session: { strategy: "jwt" }` config (`apps/web/src/auth.ts`, with its own comment:
  "no DB lookup at runtime"), NextAuth's core never actually calls any of these at request time —
  functionally dead today. **Deliberately not narrowed anyway:** unlike `accounts`/
  `verification_tokens`, where the missing methods are a permanent property of the adapter version,
  `sessions`' idle state is a one-line config value (`strategy: "jwt"` → `"database"`) that could
  change without anyone thinking to also touch a grants migration. Coupling a privilege revoke to
  an easily-flipped config value is exactly the kind of fragility this design is trying to remove
  elsewhere (see the `policies.sql`-sync requirement in §4) — full CRUD here is the conservative,
  zero-regression-risk choice, matching current wildcard-granted behavior exactly.

**`users` — drop DELETE.** No DELETE policy exists; the "no hard-delete of users" convention is
deliberate (FK-referenced by orders, ledger legs, addresses). The decisive argument is Finding A:
keeping the grant is what makes 11,435 rows of failed test teardown invisible. **Explicitly
rejected:** adding a `users_admin_delete` policy to "make teardown work" — that would weaken a
production data-integrity invariant to serve test ergonomics.

**`ledger_entries` — drop UPDATE and DELETE.** Append-only double-entry ledger; corrections are
reversing legs (existing project convention, independent of this design). Policies encode exactly
that. UPDATE is unused in app and test code (verified by grep). DELETE appears only in 3 test
teardowns, already silent no-ops. Highest-value revoke in the set: financial-record immutability
enforced at two layers instead of one.

**`platform_config_audit` — drop UPDATE and DELETE.** Append-only audit trail; policies are S+I
only. Zero app or test code touches UPDATE/DELETE. Free revoke.

**`admin_bypass_audit` — drop UPDATE and DELETE.** Same reasoning, stronger: this table is the
evidence trail for privilege escalation (`withAdmin` writes a row on every bypass). If a
compromised path could delete from it, the audit trail is worthless. Its own migration (0008)
granted full CRUD — that was a pre-existing mistake independent of the wildcard. Blast radius: 4
test teardowns, already no-ops.

**`processed_webhook_events` — drop UPDATE and DELETE.** This is the payment idempotency guard.
Deleting a row here would permit a webhook replay to be processed twice (double-charge/
double-fulfilment). Policies are S+I only, correctly. Blast radius: 4 test teardowns, already
no-ops.

**`brand_subscription_plans` — drop DELETE.** Policies are read/insert/update only; no admin
"delete plan" feature exists in `src/` (verified — only test teardowns reference delete). Plans
are referenced by `brand_subscriptions`; soft-deactivation is the existing model.

**`duplicate_charges` — drop DELETE.** Policies are staff-read + bypass-insert + bypass-update. No
code deletes it — a payments reconciliation record; deletion should not be possible. Free revoke.

**`user_consents` / `body_image_upload_log` / `store_category_assignments` — revoke is needed.**
Three separable questions:

1. _Does "just stop running the wildcard" self-correct?_ On a **fresh** environment, yes — with no
   wildcard, each table only ever gets its own migration's narrow grant (no
   `ALTER DEFAULT PRIVILEGES` exists anywhere). On **existing, long-lived** environments (prod), no
   — migrations only move forward, so past drift persists.
2. _Does restating the narrow grant in 0027 protect against a future stray wildcard?_ No — 0027
   runs once and is recorded in `_bomy_migrations`; a wildcard run afterwards re-widens everything
   and nothing re-narrows it. Additive re-grants buy nothing here.
3. _So is the REVOKE warranted?_ Yes, but understand what it buys: **convergence of already-drifted
   environments (prod) at deploy time.** It does not buy protection against recurrence. Three
   distinct mechanisms are required and none substitutes for another: REVOKE in 0027 (converges
   drift), deleting the wildcard from all three locations (§4, prevents recurrence), a standing
   grants assertion test in CI (§5, detects recurrence).

---

## 3. Migration Plan — `0027_bomy_app_least_privilege_grants.sql`

### 3.1 Prerequisite: strip already-no-op teardown deletes (same PR, lands first)

Once CI stops running the wildcard, `users` receives exactly what 0027 declares. If 0027 omits
DELETE (per §2), every `tx.delete(users)` in a test teardown becomes
`ERROR: permission denied for table users` instead of a silent no-op — ~44 test files would start
failing in `afterAll`.

The fix is **behavior-preserving by construction**: these statements delete 0 rows today; removing
them deletes 0 rows too.

| Table                      | Files affected                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `users`                    | 44 files across `packages/db/tests`, `apps/web/tests`, `apps/admin/tests`, `apps/api/tests` |
| `ledger_entries`           | 3 files (`apps/api/tests/webhooks/*.test.ts`)                                               |
| `processed_webhook_events` | 4 files                                                                                     |
| `admin_bypass_audit`       | 4 files (corrected from initial estimate)                                                   |
| `brand_subscription_plans` | 5 files (corrected from initial estimate)                                                   |

**No per-site comment.** There's no shared teardown helper across the four test suites (checked —
`packages/db/tests`, `apps/web/tests`, `apps/admin/tests`, `apps/api/tests` each write their own
inline `afterAll` blocks), so a repeated one-liner at each of the ~60 removal sites would just be
diff noise explaining a deletion — the kind of comment this project's own conventions already say
not to write. One central note is enough: migration `0027`'s own header comment (§3.2) documents
the full matrix and rationale, and the PR description points there. The diffs at each site are pure
removals, nothing added. The 11,435 orphaned rows already in the local dev DB are pre-existing
status quo, not a regression from this change; a one-off prune (as the `bomy` owner role, which
bypasses RLS as table owner) is a reasonable follow-up but out of scope here.

Also simplify `apps/web/tests/auth/consent/actions.test.ts:113-130` (Finding B) — the try/catch
tolerating both environments can now assert `permission denied` deterministically.

### 3.2 Migration shape

**One guarded `DO $$ ... $$` block containing the entire matrix — no `--> statement-breakpoint`
markers inside it.** This matters mechanically: `packages/db/scripts/migrate.mjs` splits a
migration file on `--> statement-breakpoint` and issues each fragment as a separate
`sql.unsafe(...)` call with **no wrapping transaction** (confirmed by reading the script — no
`BEGIN`/`COMMIT` anywhere in `applySqlFile`). A bare `REVOKE ALL ...` followed by a breakpoint and
then `GRANT ...` would leave a window — and would leave the DB permanently broken if the process
died between statements. A single `DO $$ ... $$` block is one top-level statement, hence one
implicit transaction: atomic, all-or-nothing.

Structure:

1. Header comment: this migration is the declarative snapshot of the `bomy_app` grant matrix as of
   0026; it supersedes the wildcard grant previously applied by CI, `policies.sql` §6, and the prod
   cutover runbook. Convention going forward is unchanged — every new table migration self-grants
   its own narrow grant; 0027 is not re-edited for future tables.
2. `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app')` guard, matching 0026's
   precedent.
3. `GRANT USAGE ON SCHEMA public TO bomy_app` and `... SCHEMA app ...`.
4. `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bomy_app` — the declarative reset. Preferable to
   13 targeted REVOKEs: guarantees convergence to the exact matrix regardless of what drift a given
   environment carries (important precisely because prod's state is unverifiable from here), and
   catches any table migrations don't currently know about. Safe because every table in `public`
   originates from a migration and every one is re-granted a few lines later inside the same atomic
   block. Migration tooling runs as the `bomy` owner and is unaffected.
5. `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM bomy_app` — removes the vacuous
   `_bomy_migrations_id_seq` grant. Comment: no sequence grants are needed today (all PKs are
   `gen_random_uuid()`); any future migration adding a `serial`/`bigserial` column must grant
   `USAGE, SELECT` on its own sequence in that same migration — the per-table self-grant convention
   extended to sequences.
6. 34 explicit `GRANT <verbs> ON "<table>" TO bomy_app` statements, in matrix order, grouped by
   originating migration with section comments; each narrow-grant table carries a one-line
   rationale (matching 0026's existing comment style).
7. 5 explicit `GRANT EXECUTE ON FUNCTION app.<fn>() TO bomy_app` statements — named individually,
   not `ON ALL FUNCTIONS`. Load-bearing: without these plus schema `app` USAGE, every RLS-gated
   query fails.
8. No `GRANT ... ON ALL FUNCTIONS IN SCHEMA public` — zero custom functions exist there.

**Deliberately deferred:** `REVOKE EXECUTE ON FUNCTION app.* FROM PUBLIC`. Postgres grants EXECUTE
to `PUBLIC` by default, so the explicit `bomy_app` grant is partially redundant, and a
`FROM PUBLIC` revoke would tighten it further. Not included here because Neon provisions its own
roles (`neondb_owner`, possibly others) whose membership can't be inspected from this session, and
a `FROM PUBLIC` revoke could strip EXECUTE from a role the platform depends on.
**Missing information: `\du` output on the Neon prod database.** With that, this becomes a
two-line follow-up.

### 3.3 Why each revoke is provably safe

**Two different safety arguments apply, for two different reasons — 15 of the 17 revokes are
RLS-bearing tables, 2 (`accounts`, `verification_tokens`) are not:**

For the 15 revokes on RLS-bearing tables, no permissive RLS policy exists for that verb on that
table. Under FORCE ROW LEVEL SECURITY (enabled on all 31 RLS-bearing tables), a statement with no
matching permissive policy affects zero rows for every caller — including `withAdmin`, because
bypass is implemented as an `app.is_admin_bypass()` predicate inside policies, not as Postgres
`BYPASSRLS` (`bomy_app` is `NOBYPASSRLS`). No code path can have observed a non-zero effect from a
revoked verb on these 15; they are provably dead. The only observable change is
error-vs-silence (§3.1).

For `accounts` and `verification_tokens` — which carry **no RLS at all** — the RLS-backstop
argument doesn't apply and a different one does: the vendored `@auth/drizzle-adapter@1.11.2`
implements no `updateAccount` or `updateVerificationToken` method (source read directly, §2.1),
and a repo-wide grep confirms nothing else in this codebase issues `UPDATE` against either table.
Safety here rests on "no code path exists that could issue this statement," not on a policy
backstop — worth stating plainly since it's a materially weaker guarantee than the RLS case (a
future adapter upgrade that _adds_ an update method, or hand-written code bypassing the adapter,
could reintroduce a need for UPDATE without RLS to catch a mistaken omission). If either table ever
needs an admin-driven manual OAuth-token or token-record update, that's a deliberate schema/grant
change to make consciously, not something to backfill quietly.

**Existing regression coverage for the 15 RLS-bearing revokes:** `packages/db/tests/rls.test.ts`,
`catalog.test.ts`, `cart_checkout.test.ts`, `order_webhook.test.ts`, `order_management.test.ts`,
`memberships.test.ts`, `duplicate_charges.test.ts`, `admin-bypass-audit.test.ts`,
`body-image-upload-log-rls.test.ts`, `rate-limit.test.ts`, plus the full
`apps/web`/`apps/admin`/`apps/api` integration suites — all run against `bomy_app` with
`BOMY_RLS_READY=1` and exercise every table's _allowed_ operations. A grant that's too narrow
surfaces immediately as `permission denied` — loud and unambiguous, no new work needed.

**No equivalent coverage exists for `accounts`/`verification_tokens`.** No test in this repo drives
a real OAuth sign-in or magic-link flow through the actual `@auth/drizzle-adapter` against a live
`bomy_app` connection (`apps/web/tests/auth/` covers the edge `authorized()` callback and the
consent gate, not the adapter). Their safety net is the source-reading in §2.1 plus the
`has_table_privilege` assertions in §5 — not a behavioral integration test. Worth flagging as a
gap independent of this migration: an end-to-end adapter smoke test (real Google OAuth or
magic-link sign-in against `bomy_app`) would be valuable follow-up work, not a blocker here.

A new test asserting all 17 revoked privileges are actually _gone_ is covered in §5.

### 3.4 Checklist

- [ ] Create `packages/db/drizzle/0027_bomy_app_least_privilege_grants.sql`.
- [ ] **Add the `0027` entry to the `MIGRATIONS` array in `packages/db/scripts/migrate.mjs`**
      (currently ends at 0026, ~line 144). A migration file not listed there **silently never
      runs** — no error, no warning. Single highest-risk omission in this whole change.
- [ ] Do not edit `0000`-`0026`.
- [ ] Prerequisite teardown strip (§3.1) committed in the same PR.
- [ ] `policies.sql` §6 updated to mirror 0027 (§4).
- [ ] `ci.yml` wildcard step deleted (§4).
- [ ] Runbook step 4 replaced (§4).
- [ ] `rls.test.ts` doc comment corrected (§4).
- [ ] New `packages/db/tests/grants.test.ts` (§5).

---

## 4. CI / Runbook / Reference Plan

**`.github/workflows/ci.yml` — delete the "Grant bomy_app table access" step (~lines 107-114)
entirely.** Keep the "Create bomy_app role" step (CI's analogue of `01_app_role.sql`) — still
required. Post-deletion sequence: create role → `pnpm --filter @bomy/db migrate` → `pnpm test`. This
isn't just cleanup, it's the proof mechanism: CI is the only environment that builds a database
from zero on every run, so removing the step makes every CI run a continuous assertion that role
setup + `migrate` alone is sufficient. Leaving it in place would let 0027 be silently wrong (e.g.
omitted from the `MIGRATIONS` array) with all tests still green.

**`docs/runbooks/public-deployment-cutover.md` step 4 (lines 60-67) — replace, not delete.** The
step is load-bearing in the runbook's narrative; deleting it invites someone to "helpfully" re-add
the wildcard. Replace the six `GRANT` lines with: (a) a note that `bomy_app` grants are now applied
by migration `0027` as part of the normal migrate step, and re-running the old wildcard is a
**regression**; (b) a verification snippet in its place — a short `psql` check asserting a handful
of `has_table_privilege('bomy_app', ...)` booleans (at minimum `users`/DELETE = false,
`ledger_entries`/UPDATE = false, `user_consents`/SELECT = true). Since the wildcard was almost
certainly applied to Neon during the PR #39 cutover, add a one-time note that deploying 0027 to
prod will _revoke_ privileges and the operator should confirm app health immediately after.

**`packages/db/src/rls/policies.sql` §6 (lines 436-441) — replace with the least-privilege
equivalent, mirroring 0027 exactly (including revokes).** Not a historical note, not deletion.
Three reasons: (a) the file's own dominant style is already per-table (e.g. `body_image_upload_log`
carries its own narrow grant) — the wildcard was always the odd one out; (b) the file's stated
purpose is a complete readable snapshot of the current access model; (c) most importantly,
`rls.test.ts` documents hand-running this file as a recovery procedure — making §6 mirror 0027
turns that procedure from _the cause of the drift_ into _the cure for it_. Add a header comment:
`-- Mirror of migration 0027. policies.sql is a reference document; 0027 is the executable source of truth. Keep in sync when adding a table.`

**Hard requirement, not a soft aspiration — this is the sharp edge of the whole design and needs
to be stated as one explicitly, not left as a comment to notice.** `0027`'s migration plan (§3.2)
uses `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bomy_app` as a declarative reset before
re-granting the matrix — that's correct for convergence (§2.1), but it means `policies.sql` §6,
once rewritten to mirror `0027`, becomes a **second copy of a REVOKE-ALL-then-explicit-grant
block**, not just an additive reference. If a future migration adds a new table (following the
established per-table self-grant convention, unchanged) and `policies.sql` §6 is **not** updated in
the same PR, then the next time anyone follows `rls.test.ts`'s documented recovery procedure and
re-runs `policies.sql` on a drifted environment, its stale `REVOKE ALL ON ALL TABLES` will strip the
new table's grant — including on prod — with `policies.sql` §6 having no explicit re-grant for it
since it doesn't know the table exists. **This is a new, self-inflicted version of the exact bug
this whole migration exists to fix, and it would be triggered by the documented recovery path
itself.**

Concretely, **every future migration that creates a new table (or changes an existing table's
grant) must, in the same PR, touch all three of:**

1. The table's own `GRANT` statement in its own migration file (existing convention, unchanged).
2. The corresponding block in `packages/db/src/rls/policies.sql` §6's explicit per-table list.
3. The corresponding row(s) in `packages/db/tests/grants.test.ts`'s exported matrix constant.

Missing (2) creates the landmine above. Missing (3) means a regression wouldn't be caught by CI.
This is the same category of discipline as "never edit an applied migration" — enforced by review,
not tooling, but called out explicitly here (and should go in `CLAUDE.md`'s RLS section, not just
this design doc, once implemented) so it isn't discovered the hard way. A CI check that parses
`policies.sql` §6 and asserts it matches the migrations' declared grants exactly would close this
gap structurally rather than relying on review discipline — worth a follow-up ticket, not required
to land with this PR.

**`packages/db/tests/rls.test.ts` doc comment (line 16)** currently reads
`Then re-run policies.sql to grant bomy_app table access.` — this instructs exactly the operation
that causes the overgrant and must change regardless of other decisions. Replace with:

> `bomy_app` grants are applied by migration `0027` as part of `pnpm --filter @bomy/db migrate` —
> there is no manual grant step. Never hand-run
> `GRANT ... ON ALL TABLES IN SCHEMA public TO bomy_app`; it re-widens tables that are deliberately
> narrow (see `0027` for the matrix). If grants look wrong on an existing volume, converge them by
> re-running `psql ... < packages/db/src/rls/policies.sql` (§6 mirrors `0027`, including the
> revokes), then confirm with `packages/db/tests/grants.test.ts`.

---

## 5. Fresh-DB Verification

**Decision: a new Vitest integration test, `packages/db/tests/grants.test.ts`, gated exactly like
`rls.test.ts`** (`BOMY_RLS_READY === "1"` and `DATABASE_APP_URL ?? DATABASE_URL`), combined with
removing CI's wildcard step (§4). No standalone script, no bespoke CI job.

**Why not the alternatives:**

- A standalone `sync-check.sh`-style script is the wrong tool — that script exists for local
  `docker exec` convenience against a named container; this assertion needs to run in CI on every
  PR forever, which is exactly what `makeDb()` + the `BOMY_RLS_READY` convention already provide
  without new plumbing.
- A bespoke CI job is redundant — CI already provisions fresh Postgres, creates `bomy_app`, runs
  `migrate`. Once the wildcard step is deleted, the existing "Run tests" step _is_ the fresh-DB
  verification; the test just needs to exist.
- Vitest gives the negative assertions a natural home next to `rls.test.ts`, which covers the
  behavioral half.

Deleting CI's wildcard step and adding this test are one change: the test asserts the matrix, and
running in an environment where the wildcard was never applied is what proves `migrate` alone is
sufficient — not "we removed the step and nothing looked broken" but "we removed the step and ~140
privilege bits are asserted to their exact expected boolean."

### What the test asserts

**(a) Table matrix — exact booleans, table-driven.** One exported const holding all 34 rows × 4
verbs (the §2 matrix), then one assertion per cell via
`select has_table_privilege('bomy_app', $1, $2)`, asserted `toBe(true)`/`toBe(false)` — never "did
not throw". Covers both the 8 formerly-ungranted tables now having their target grants, and the 17
revoked privileges being `false` — including `users`/DELETE, `ledger_entries`/UPDATE+DELETE,
`platform_config_audit`/UPDATE+DELETE, `admin_bypass_audit`/UPDATE+DELETE,
`processed_webhook_events`/UPDATE+DELETE, `brand_subscription_plans`/DELETE,
`duplicate_charges`/DELETE, `user_consents`/UPDATE+DELETE, `body_image_upload_log`/UPDATE,
`store_category_assignments`/UPDATE, `accounts`/UPDATE, `verification_tokens`/UPDATE. Also assert
`verification_tokens`/SELECT = `true` explicitly — the one easy-to-get-wrong positive in this set
(§2.1 covers why a plain reading of the adapter's `useVerificationToken` looks SELECT-free but
isn't). The `false` assertions are what no existing test can produce, and what makes a future
stray wildcard fail CI loudly instead of silently re-widening prod.

Note: **this test will fail on the current local dev volume until 0027's revokes actually run**
(that volume currently has `users`/DELETE = true, etc.). That's correct and desirable — the test
detecting real drift on a real environment.

**(b) Schema and function access:**

```sql
select has_schema_privilege('bomy_app', 'public', 'USAGE');   -- true
select has_schema_privilege('bomy_app', 'app', 'USAGE');      -- true
select has_function_privilege('bomy_app', 'app.current_user_id()', 'EXECUTE'); -- true (×5 functions)
select has_sequence_privilege('bomy_app', '_bomy_migrations_id_seq', 'USAGE'); -- false
```

**(c) One true end-to-end chain assertion.** Privilege bits alone don't prove the chain works — a
missing schema `app` USAGE grant, for example, would surface as `permission denied for schema app`
during policy evaluation, which no `has_table_privilege` check would catch. Add a `withTenant` test
seeding and reading a tenant-scoped row with cross-tenant isolation asserted (mirroring
`rls.test.ts`'s existing "seller A cannot read seller B's store" shape), scoped to `stores` — a
table that had **zero** privileges before this migration, so this specifically exercises the newly
granted path end to end. Complement with one negative-path case: a `withTenant` DELETE against
`users` should now reject with `permission denied for table users` rather than silently affecting 0
rows — the direct regression test for Finding A.

---

## Critical files for implementation (not yet touched)

- `packages/db/drizzle/0027_bomy_app_least_privilege_grants.sql` (new)
- `packages/db/scripts/migrate.mjs` (`MIGRATIONS` array — omission here silently disables the migration)
- `packages/db/src/rls/policies.sql` (§6, lines 436-441)
- `.github/workflows/ci.yml` (delete "Grant bomy_app table access" step, ~lines 107-114)
- `docs/runbooks/public-deployment-cutover.md` (step 4, lines 60-67)
- `packages/db/tests/rls.test.ts` (doc comment, line 16)
- `packages/db/tests/grants.test.ts` (new)
- ~60 test files across `packages/db`, `apps/web`, `apps/admin`, `apps/api` (strip already-no-op
  teardown deletes per §3.1)
