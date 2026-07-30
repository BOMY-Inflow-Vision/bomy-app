-- Migration 0027: bomy_app least-privilege grant bootstrap (GAPS #16).
--
-- Declarative snapshot of every bomy_app grant as of migration 0026, plus
-- schema (public, app) USAGE and named app.* function EXECUTE grants.
-- Supersedes the wildcard `GRANT ... ON ALL TABLES IN SCHEMA public` that
-- was previously applied out-of-band by CI (.github/workflows/ci.yml),
-- packages/db/src/rls/policies.sql §6, and the prod deployment runbook
-- (docs/runbooks/public-deployment-cutover.md) — none of which was a
-- tracked migration, so a fresh environment built from `pnpm --filter
-- @bomy/db migrate` alone left bomy_app with zero privileges on users,
-- stores, ledger_entries, platform_config, platform_config_audit,
-- accounts, sessions, and verification_tokens (migrations 0000/0001,
-- which predate the "every migration self-grants its own table" convention
-- established from 0002 onward).
--
-- The wildcard was also *wider* than three tables' own migrations intend
-- (user_consents, body_image_upload_log, store_category_assignments each
-- deliberately omit a verb their table's own migration never granted) and
-- wider than several original tables' actual RLS policies ever use: users
-- has no DELETE policy, ledger_entries/platform_config_audit/
-- admin_bypass_audit/processed_webhook_events are append-only (SELECT+
-- INSERT only), brand_subscription_plans and duplicate_charges have no
-- DELETE policy. Under FORCE ROW LEVEL SECURITY, a grant wider than the
-- policy set isn't a bypass — RLS still blocks it — but it silently
-- converts "permission denied" into "affected 0 rows", which is exactly
-- why every test file's `tx.delete(users)` teardown has been silently
-- failing (see the same PR's test-file changes; ~60 already-no-op
-- teardown deletes were removed).
--
-- accounts/sessions/verification_tokens carry no RLS (see migration 0001)
-- — their target grants come from the actual Auth.js adapter contract
-- (@auth/drizzle-adapter@1.11.2, lib/pg.js, read directly), not policy
-- verbs: accounts has no updateAccount method (S, I, D only);
-- verification_tokens has no update method either, and — despite
-- useVerificationToken doing a single DELETE...WHERE...RETURNING with no
-- separate read call — still needs SELECT, because PostgreSQL requires
-- SELECT privilege on any column referenced in a DELETE's WHERE clause,
-- independent of RETURNING (verified empirically). sessions keeps full
-- CRUD deliberately: the adapter implements all four operations, and
-- although NextAuth's core never calls them under this project's
-- `session: { strategy: "jwt" }` config, narrowing the grant would couple
-- database privileges to a one-line auth.ts value that could change
-- without anyone remembering to also touch a grants migration.
--
-- Design + full per-table rationale:
-- docs/superpowers/specs/2026-07-27-rls-grant-bootstrap-design.md
--
-- Convention going forward is UNCHANGED: every new table migration
-- self-grants its own narrow grant in its own file, exactly as before.
-- This migration is not re-edited for future tables — but per the design
-- doc §4, any future migration that adds/changes a table's grant MUST, in
-- the same PR, also update packages/db/src/rls/policies.sql §6 (which
-- mirrors this migration, including its REVOKE ALL reset — a stale §6
-- would strip a new table's grant if ever hand-re-run as a recovery
-- procedure) and packages/db/tests/grants.test.ts's asserted matrix.
--
-- One atomic DO block, deliberately not split with `--> statement-
-- breakpoint`: packages/db/scripts/migrate.mjs issues each breakpoint-
-- delimited fragment as a separate, non-transactional statement. A bare
-- REVOKE ALL followed by a breakpoint then re-GRANTs would leave a window
-- — and would leave bomy_app permanently locked out if the process died
-- between statements. A single DO block is one top-level statement, hence
-- one implicit transaction: all-or-nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN

    -- ─── 1. Schema usage ──────────────────────────────────────────────
    EXECUTE 'GRANT USAGE ON SCHEMA public TO bomy_app';
    EXECUTE 'GRANT USAGE ON SCHEMA app TO bomy_app';

    -- ─── 2. Declarative reset ─────────────────────────────────────────
    -- Guarantees convergence to the exact matrix below regardless of what
    -- drift a given environment (prod) currently carries — every table is
    -- re-granted a few statements later in this same atomic block.
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bomy_app';
    -- No sequence grants are needed today — every table PK is
    -- gen_random_uuid(); the only sequence in schema public is the
    -- internal, owner-only _bomy_migrations_id_seq, which the wildcard
    -- had granted to bomy_app as a minor overgrant. Any future migration
    -- adding a serial/bigserial column must grant USAGE, SELECT on its
    -- own sequence in that same migration — the per-table self-grant
    -- convention extended to sequences.
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM bomy_app';

    -- ─── 3. Per-table grants (matrix order, grouped by origin migration) ──

    -- origin: 0000 (no grant declared there — this migration is the first)
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "users" TO bomy_app'; -- no DELETE policy
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "stores" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT ON "ledger_entries" TO bomy_app'; -- append-only ledger
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_config" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT ON "platform_config_audit" TO bomy_app'; -- append-only audit trail

    -- origin: 0001 (no RLS; grants follow the Auth.js adapter contract, not policy verbs)
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "accounts" TO bomy_app'; -- adapter has no updateAccount
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "sessions" TO bomy_app'; -- full adapter contract, kept even though session.strategy="jwt" makes it unused today
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "verification_tokens" TO bomy_app'; -- SELECT required: DELETE...WHERE needs it independent of RETURNING

    -- origin: 0002
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "seller_inquiries" TO bomy_app';

    -- origin: 0003
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "member_subscriptions" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "brand_subscription_plans" TO bomy_app'; -- no DELETE policy; soft-deactivation is the model
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_subscriptions" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "vouchers" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "goodie_box_dispatches" TO bomy_app';

    -- origin: 0008
    EXECUTE 'GRANT SELECT, INSERT ON "admin_bypass_audit" TO bomy_app'; -- privilege-escalation evidence trail; append-only

    -- origin: 0009
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "categories" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "products" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "product_variants" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "product_images" TO bomy_app';

    -- origin: 0011
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "checkout_sessions" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "checkout_session_items" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "checkout_session_stores" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory_reservations" TO bomy_app';

    -- origin: 0012
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "orders" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "order_items" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "order_payouts" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT ON "processed_webhook_events" TO bomy_app'; -- payment idempotency guard; append-only

    -- origin: 0014
    EXECUTE 'GRANT SELECT, INSERT ON "user_consents" TO bomy_app'; -- consent records are append-only

    -- origin: 0015
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "user_addresses" TO bomy_app';

    -- origin: 0016
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "duplicate_charges" TO bomy_app'; -- no DELETE policy; reconciliation record, permanent by design

    -- origin: 0021
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "body_image_upload_log" TO bomy_app'; -- no UPDATE policy

    -- origin: 0025
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "store_categories" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "store_category_assignments" TO bomy_app'; -- no UPDATE on the junction table

    -- origin: 0026
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "action_rate_limits" TO bomy_app';

    -- ─── 4. app.* function execute (named individually, not ON ALL FUNCTIONS) ──
    -- Load-bearing: RLS USING/WITH CHECK clauses call these as bomy_app, so
    -- without EXECUTE + schema app USAGE (above), every RLS-gated query fails.
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.assert_tenant_context() TO bomy_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.current_user_id() TO bomy_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.current_user_role() TO bomy_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.is_admin_bypass() TO bomy_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.is_bomy_staff() TO bomy_app';

  END IF;
END
$$;
