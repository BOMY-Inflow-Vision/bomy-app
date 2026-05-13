-- Migration 0008: admin_bypass_audit + system user seed.
--
-- Closes the Stage 4 deferral (project_deferred_audit.md). After this
-- migration lands, packages/db/src/tenant.ts:withAdmin writes one audit
-- row per call inside the same transaction. Every RLS bypass thus
-- leaves a durable, transactional forensic trail.
--
-- Self-contained: includes table, indexes, ENABLE/FORCE RLS, all
-- policies, and bomy_app grants in one migration file (consistent with
-- 0003_membership_subscriptions.sql pattern). src/rls/policies.sql is
-- the canonical documentation source; it is updated in lockstep but
-- is NOT applied at runtime.
--
-- Idempotency: every statement is guarded with IF NOT EXISTS / ON
-- CONFLICT DO NOTHING / DO blocks so re-runs are safe.

-- ─── 1. Seed the system actor user row ─────────────────────────────
-- Background jobs use SYSTEM_ACTOR = 00000000-0000-0000-0000-000000000001
-- as the withAdmin actor. Without this row, the FK on
-- admin_bypass_audit.actor_user_id would fail every job-initiated
-- audit insert.

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
--> statement-breakpoint

-- ─── 2. admin_bypass_audit table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "admin_bypass_audit" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason"        text NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_bypass_audit_actor_idx"
  ON "admin_bypass_audit" USING btree ("actor_user_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_bypass_audit_created_at_idx"
  ON "admin_bypass_audit" USING btree ("created_at");
--> statement-breakpoint

-- ─── 3. ENABLE + FORCE RLS ──────────────────────────────────────────
ALTER TABLE "admin_bypass_audit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admin_bypass_audit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ─── 4. RLS policies ────────────────────────────────────────────────
-- Default-deny: no tenant context AND no admin bypass → no rows.
DO $$ BEGIN
  CREATE POLICY admin_bypass_audit_default_deny ON admin_bypass_audit
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- Staff can SELECT for forensic review (bomy_admin/ops/finance).
DO $$ BEGIN
  CREATE POLICY admin_bypass_audit_staff_read ON admin_bypass_audit
    FOR SELECT
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- INSERT only when app.bypass_rls=true (i.e. the withAdmin wrapper
-- has activated bypass before the audit insert runs). This means
-- ONLY withAdmin-initiated inserts succeed — the table cannot be
-- written by tenant sessions.
DO $$ BEGIN
  CREATE POLICY admin_bypass_audit_bypass_insert ON admin_bypass_audit
    FOR INSERT
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- No UPDATE or DELETE policy — append-only enforced by FORCE RLS plus omission.

-- ─── 5. bomy_app role grants on new table ──────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "admin_bypass_audit" TO bomy_app';
  END IF;
END
$$;
