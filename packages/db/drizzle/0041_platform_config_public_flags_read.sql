-- Migration 0041: public read-only access to the three payment on/off flags in platform_config.
--
-- Design: docs/superpowers/specs/2026-11-24-psp-stripe-design.md §3.4.
--
-- Before this file, platform_config was staff-only under RLS (platform_config_staff_read /
-- platform_config_staff_write), so the storefront read checkout_enabled, active_psp and
-- subscriptions_enabled under withAdmin and wrote one admin_bypass_audit row per page view.
-- This adds ONE permissive SELECT policy so a non-staff context (withPublicRead, or withTenant as a
-- buyer / seller) can read exactly those three rows and nothing else.
--
-- How it combines with the existing policies (verified by packages/db/tests/platform-config-public-flags-rls.test.ts):
--   * platform_config_default_deny (RESTRICTIVE, all commands) still applies: a session with no
--     app.current_user_id and no bypass sees nothing. withPublicRead sets the nil UUID, withTenant
--     a real one, so both pass it.
--   * Permissive SELECT policies are OR'd: staff keep every row through platform_config_staff_read;
--     everyone else gets only the three keys through this policy.
--   * FOR SELECT only. INSERT / UPDATE / DELETE are still governed solely by
--     platform_config_staff_write (staff or bypass), so a non-staff UPDATE or DELETE matches 0 rows
--     and an INSERT fails its WITH CHECK (42501). SELECT ... FOR UPDATE / FOR SHARE also applies the
--     UPDATE policies, so a non-staff context cannot lock these rows either.
--   * Grants are unchanged: bomy_app already has table-level SELECT/INSERT/UPDATE/DELETE on
--     platform_config (0027), no TRUNCATE. Writes stay blocked by RLS, not by grants.
--
-- Columns: RLS is row-level only, and staff use the same bomy_app role, so a column grant cannot
-- hide updated_by / description / updated_at from non-staff without also hiding them from staff.
-- For the three rows above those columns are visible to any non-staff bomy_app query that asks
-- for them (updated_by is a staff user uuid; users RLS stops a non-staff context resolving it).
-- The application's public lookup selects only key and value. Nothing outside our server code
-- connects as bomy_app.
--
-- No data change. Re-runnable (DROP POLICY IF EXISTS + CREATE) and atomic (one transaction).
-- Rollback: DROP POLICY IF EXISTS platform_config_public_flags_read ON platform_config;
-- (only after the storefront is back on withAdmin reads, or flag reads fail closed to "off").

BEGIN;

DROP POLICY IF EXISTS platform_config_public_flags_read ON platform_config;

CREATE POLICY platform_config_public_flags_read ON platform_config
  AS PERMISSIVE
  FOR SELECT
  USING (key IN ('checkout_enabled', 'active_psp', 'subscriptions_enabled'));

COMMIT;
