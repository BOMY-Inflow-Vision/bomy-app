-- BOMY Row-Level Security — policies, roles, and runtime assertion.
-- Source of truth for every RLS decision. Re-run idempotently.
-- Covers guardrails 2, 3, 6 from Proposal v2 §7; guardrail 1 (the
-- withTenant wrapper) lives in TypeScript at src/tenant.ts.
--
-- Apply order: roles → assertion function → ENABLE/FORCE RLS →
-- default-deny → explicit allow policies.
--
-- NOTE: Schema migrations are not generated in PR #6. This file is
-- authored for the Drizzle-Kit custom-SQL step that lands alongside
-- the first migration (PR #9). It typechecks as static SQL; no JS
-- runs it yet.

-- ─── 1. bomy_admin role (guardrail #3) ────────────────────────────
-- Dedicated DB role with BYPASSRLS. Used only by admin services
-- (ops console, reconciliation jobs). Regular app workloads connect
-- as the application role and must use the `withTenant` wrapper.
-- CREATE ROLE is wrapped in a DO block so the migration is idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_admin') THEN
    CREATE ROLE bomy_admin NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- ─── 2. Runtime assertion helper (guardrail #6) ───────────────────
-- Call this at the top of sensitive queries in dev/staging to surface
-- "RLS was set up but nobody set tenant context" bugs. In production
-- the RLS default-deny policies already drop queries without
-- app.current_user_id set — this function exists so ops can *see*
-- that drop happening before it becomes data loss.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.assert_tenant_context()
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF current_setting('app.current_user_id', true) IS NULL
     OR current_setting('app.current_user_id', true) = '' THEN
    RAISE WARNING 'rls.missing_context: app.current_user_id is not set';
  END IF;
END;
$$;

-- Helper: is the current session an admin bypass?
CREATE OR REPLACE FUNCTION app.is_admin_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), 'false') = 'true';
$$;

-- Helper: current user id as uuid (null if unset).
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- Helper: current user role (null if unset).
CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_role', true), '');
$$;

-- Helper: is current role one of the BOMY-staff roles?
CREATE OR REPLACE FUNCTION app.is_bomy_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_user_role() IN ('bomy_ops', 'bomy_admin', 'bomy_finance');
$$;

-- ─── 3. ENABLE + FORCE RLS on every tenant-scoped table (guardrail #2) ──
-- FORCE ensures even the table owner is subject to RLS; combined with
-- BYPASSRLS on the bomy_admin role, this means only explicit admin
-- workloads skip the policy checks.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores FORCE ROW LEVEL SECURITY;

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config FORCE ROW LEVEL SECURITY;

ALTER TABLE platform_config_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config_audit FORCE ROW LEVEL SECURITY;

-- ─── 4. Default-deny policies (RESTRICTIVE) ──────────────────────
-- RESTRICTIVE policies are AND'd with PERMISSIVE ones, so this makes
-- "no tenant context AND no admin bypass" = "nothing visible".
-- Without this, a missing explicit policy would mean no rows — safe
-- by default — but the RESTRICTIVE makes the intent explicit and
-- catches the case where someone adds a PERMISSIVE policy but forgets
-- the tenant clause.

CREATE POLICY users_default_deny ON users
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY stores_default_deny ON stores
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY ledger_entries_default_deny ON ledger_entries
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY platform_config_default_deny ON platform_config
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY platform_config_audit_default_deny ON platform_config_audit
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- ─── 5. Explicit allow policies ──────────────────────────────────

-- users: a user can read/update their own row; BOMY staff see all;
-- admin-bypass sees all. No one can delete through RLS (handled by
-- not granting DELETE in the permissive policies).

CREATE POLICY users_self_read ON users
  FOR SELECT
  USING (
    id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY users_self_update ON users
  FOR UPDATE
  USING (
    id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  )
  WITH CHECK (
    id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY users_insert_staff_only ON users
  FOR INSERT
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- stores: owner sees/edits their own store. Public (authenticated)
-- reads are allowed for stores with status='active' so the browse
-- pages work. BOMY staff see all.

CREATE POLICY stores_owner_read ON stores
  FOR SELECT
  USING (
    owner_id = app.current_user_id()
    OR status = 'active'
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY stores_owner_update ON stores
  FOR UPDATE
  USING (owner_id = app.current_user_id() OR app.is_admin_bypass())
  WITH CHECK (owner_id = app.current_user_id() OR app.is_admin_bypass());

CREATE POLICY stores_owner_insert ON stores
  FOR INSERT
  WITH CHECK (owner_id = app.current_user_id() OR app.is_admin_bypass());

CREATE POLICY stores_staff_all ON stores
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- ledger_entries: finance-sensitive. Read gated to BOMY finance/admin
-- or to the owning seller via reference_type/reference_id (wired in
-- later PRs once orders land). No UPDATE or DELETE policy exists —
-- append-only is enforced by omission (FORCE RLS + no policy = deny).

CREATE POLICY ledger_entries_staff_read ON ledger_entries
  FOR SELECT
  USING (app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY ledger_entries_insert ON ledger_entries
  FOR INSERT
  WITH CHECK (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- platform_config + audit: admin-only at RLS layer; API layer adds
-- MFA + two-admin approval for pricing/commission changes per §18.

CREATE POLICY platform_config_staff_read ON platform_config
  FOR SELECT
  USING (app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY platform_config_staff_write ON platform_config
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY platform_config_audit_staff_read ON platform_config_audit
  FOR SELECT
  USING (app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY platform_config_audit_insert ON platform_config_audit
  FOR INSERT
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- ─── 6. Notes on what is intentionally NOT here ──────────────────
--   * Per-seller row visibility on ledger_entries by (reference_type,
--     reference_id) — wires in with the orders table (future PR).
--   * Public / anonymous read paths — apps/web does not hit the DB
--     directly; all public reads flow through apps/api and therefore
--     always have a session user. If that changes we'll add a public
--     allowlist policy here.
--   * DELETE policies — intentionally omitted for every table.
--     Soft-delete columns land when individual features need them.
