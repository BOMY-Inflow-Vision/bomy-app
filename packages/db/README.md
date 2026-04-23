# @bomy/db

Drizzle schema, Row-Level Security policies, and the `withTenant()`
connection wrapper for the BOMY platform.

This package is the **single home** for everything that touches the
database. `apps/api` and `apps/admin` import from here; `apps/web`
never talks to the database directly.

## RLS guardrails implemented here

Numbered per Proposal v2 §7:

1. **Connection acquisition wrapper** — `src/tenant.ts` exports
   `withTenant()` and `withAdmin()`. All DB access must go through one
   of these. The wrapper opens a transaction, runs
   `SELECT set_config('app.current_user_id', ..., true)` and sibling
   calls (scoped to the transaction — no pool-reuse leakage), runs the
   callback, commits or rolls back.
2. **Default-deny RLS** — `src/rls/policies.sql` enables + forces RLS
   on every tenant-scoped table with a `RESTRICTIVE ... USING (false)`
   policy, plus explicit allow policies keyed on `app.current_*`.
3. **Admin escape hatch** — a dedicated `bomy_admin` DB role with
   `BYPASSRLS` is created in `policies.sql`. `withAdmin()` is the only
   helper that opens a connection under that role; every call is
   expected to be audited at the API layer.
4. **Runtime assertion** — the SQL helper
   `app.assert_tenant_context()` emits `WARNING rls.missing_context`
   when invoked with no `app.current_user_id` set. Called from the
   wrapper's assertion path in dev/staging.
5. **Connection pool hygiene** — the `postgres-js` client is created
   with `onclose`/`onnotice` hooks and is expected to be singleton per
   process. Session state is explicitly cleared via `DISCARD ALL` in
   the wrapper's finally path as defence-in-depth.

Guardrails 4 (middleware enforcement), 5 (CI lint + integration
tests), 7 (schema-migration review), and 9 (threat-model entry) live
outside this package — wired in apps/api (4), CI (5, 7), and the
Stage 0 threat model (9).

## Scripts

- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — eslint
- `pnpm test` — vitest (RLS integration tests; auto-skip if no
  `DATABASE_URL`)
- `pnpm db:generate` — drizzle-kit generate (not wired in this PR)

## Migrations

Migration generation is intentionally out of scope for this PR. The
schema and `policies.sql` are authored and typechecked; running
`drizzle-kit generate` against a live DB lands with PR #9 (end-to-end
verification).
