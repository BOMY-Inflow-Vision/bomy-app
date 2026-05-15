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

-- Stage 4 membership tables.
ALTER TABLE member_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE brand_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_subscription_plans FORCE ROW LEVEL SECURITY;

ALTER TABLE brand_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers FORCE ROW LEVEL SECURITY;

ALTER TABLE goodie_box_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE goodie_box_dispatches FORCE ROW LEVEL SECURITY;

-- Stage 5 PR #26: durable admin bypass audit.
ALTER TABLE admin_bypass_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_bypass_audit FORCE ROW LEVEL SECURITY;

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

CREATE POLICY member_subscriptions_default_deny ON member_subscriptions
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY brand_subscription_plans_default_deny ON brand_subscription_plans
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY brand_subscriptions_default_deny ON brand_subscriptions
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY vouchers_default_deny ON vouchers
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY goodie_box_dispatches_default_deny ON goodie_box_dispatches
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY admin_bypass_audit_default_deny ON admin_bypass_audit
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

-- Stage 4: membership & subscriptions.
-- member_subscriptions: user reads own; staff sees + writes all.
-- All inserts/updates flow through the apps/api webhook handler under
-- withAdmin (audited bypass), so no buyer-level write policy.

CREATE POLICY member_subscriptions_self_read ON member_subscriptions
  FOR SELECT
  USING (
    user_id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY member_subscriptions_staff_write ON member_subscriptions
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- brand_subscription_plans: any authenticated session reads is_active
-- plans (buyers shopping); the seller_owner of the parent store sees
-- and edits their plans in any state; staff approves (sets is_active).

CREATE POLICY brand_subscription_plans_active_read ON brand_subscription_plans
  FOR SELECT
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = brand_subscription_plans.store_id
        AND stores.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY brand_subscription_plans_owner_insert ON brand_subscription_plans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = brand_subscription_plans.store_id
        AND stores.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY brand_subscription_plans_owner_update ON brand_subscription_plans
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = brand_subscription_plans.store_id
        AND stores.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = brand_subscription_plans.store_id
        AND stores.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

-- brand_subscriptions: buyer reads own; seller_owner of the store
-- sees subs to their store (no buyer PII beyond user_id); staff
-- writes via the webhook handler.

CREATE POLICY brand_subscriptions_self_read ON brand_subscriptions
  FOR SELECT
  USING (
    user_id = app.current_user_id()
    OR EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = brand_subscriptions.store_id
        AND stores.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY brand_subscriptions_staff_write ON brand_subscriptions
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- vouchers: member reads own; staff issues + redeems.

CREATE POLICY vouchers_self_read ON vouchers
  FOR SELECT
  USING (
    user_id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY vouchers_staff_write ON vouchers
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- goodie_box_dispatches: member reads own (sees tracking once admin
-- enters it); staff manages all.

CREATE POLICY goodie_box_dispatches_self_read ON goodie_box_dispatches
  FOR SELECT
  USING (
    user_id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY goodie_box_dispatches_staff_write ON goodie_box_dispatches
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

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

-- ─── 6. bomy_app role grants ─────────────────────────────────────
-- bomy_app is the non-superuser application role used by the app and
-- tests. It is subject to RLS (no BYPASSRLS). The POSTGRES_USER (bomy)
-- is a superuser used only for migrations and schema setup.
-- Role creation lives in infra/docker/postgres-init/01_app_role.sql.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO bomy_app';
    EXECUTE 'GRANT USAGE ON SCHEMA app TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bomy_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bomy_app';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO bomy_app';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bomy_app';
  END IF;
END
$$;

-- ─── 7. Notes on what is intentionally NOT here ──────────────────
--   * Per-seller row visibility on ledger_entries by (reference_type,
--     reference_id) — wires in with the orders table (future PR).
--   * Public / anonymous read paths — apps/web does not hit the DB
--     directly; all public reads flow through apps/api and therefore
--     always have a session user. If that changes we'll add a public
--     allowlist policy here.
--   * DELETE policies — omitted for most tables; soft-delete columns land
--     when individual features need them. Exception: catalog tables
--     (categories, products, product_variants, product_images) carry
--     admin-only DELETE policies (app.is_bomy_staff OR is_admin_bypass)
--     so BOMY staff can moderate content. Sellers use status='archived'.

-- ── Catalog tables (Stage 5 PR #28) ──────────────────────────────────────

ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       FORCE  ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         FORCE  ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants FORCE  ROW LEVEL SECURITY;
ALTER TABLE product_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images   FORCE  ROW LEVEL SECURITY;

-- categories: authenticated users see active; BOMY staff manage all.
CREATE POLICY categories_default_deny ON categories
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY categories_active_read ON categories
  FOR SELECT
  USING (is_active = true OR app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY categories_admin_insert ON categories
  FOR INSERT
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY categories_admin_update ON categories
  FOR UPDATE
  USING  (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

CREATE POLICY categories_admin_delete ON categories
  FOR DELETE
  USING (app.is_bomy_staff() OR app.is_admin_bypass());

-- products: active = publicly visible. Seller owns via store FK.
CREATE POLICY products_default_deny ON products
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY products_read ON products
  FOR SELECT
  USING (
    (
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = products.store_id
          AND stores.status = 'active'
      )
    )
    OR EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = products.store_id
        AND stores.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY products_seller_insert ON products
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = products.store_id AND stores.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY products_seller_update ON products
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = products.store_id AND stores.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = products.store_id AND stores.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY products_admin_delete ON products
  FOR DELETE
  USING (app.is_bomy_staff() OR app.is_admin_bypass());

-- product_variants: active variants of active products = publicly visible. Seller owns via product→store.
CREATE POLICY product_variants_default_deny ON product_variants
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY product_variants_read ON product_variants
  FOR SELECT
  USING (
    (
      is_active = true
      AND EXISTS (
        SELECT 1 FROM products
        JOIN stores ON stores.id = products.store_id
        WHERE products.id = product_variants.product_id
          AND products.status = 'active'
          AND stores.status = 'active'
      )
    )
    OR EXISTS (
      SELECT 1 FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = product_variants.product_id
        AND s.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY product_variants_seller_insert ON product_variants
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = product_variants.product_id AND s.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY product_variants_seller_update ON product_variants
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = product_variants.product_id AND s.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = product_variants.product_id AND s.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY product_variants_admin_delete ON product_variants
  FOR DELETE
  USING (app.is_bomy_staff() OR app.is_admin_bypass());

-- product_images: mirrors products policies (images are public if product is active).
CREATE POLICY product_images_default_deny ON product_images
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY product_images_read ON product_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      JOIN stores ON stores.id = products.store_id
      WHERE products.id = product_images.product_id
        AND products.status = 'active'
        AND stores.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = product_images.product_id
        AND s.owner_id = app.current_user_id()
    )
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY product_images_seller_insert ON product_images
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = product_images.product_id AND s.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY product_images_seller_update ON product_images
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = product_images.product_id AND s.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = product_images.product_id AND s.owner_id = app.current_user_id())
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY product_images_admin_delete ON product_images
  FOR DELETE
  USING (app.is_bomy_staff() OR app.is_admin_bypass());
