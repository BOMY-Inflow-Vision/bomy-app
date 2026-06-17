-- Migration 0014: user_consents table + RLS + platform_config tos_version seed.
--
-- Implements PDPA-demonstrable consent audit trail (spec 2026-06-17).
-- Append-only: no UPDATE/DELETE policy → FORCE RLS enforces it.
-- Mirrors 0008_admin_bypass_audit.sql pattern: table + RLS + grants in one file.
--
-- Idempotency: IF NOT EXISTS / ON CONFLICT DO NOTHING / DO blocks guard all stmts.

-- ─── 1. user_consents table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_consents" (
  "id"                 uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"            uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "document"           text        NOT NULL,
  "version"            text        NOT NULL,
  "accepted_ip"        text,
  "accepted_user_agent" text,
  "accepted_at"        timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_consents_user_idx"
  ON "user_consents" USING btree ("user_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_consents_user_doc_version_unique_idx"
  ON "user_consents" USING btree ("user_id", "document", "version");
--> statement-breakpoint

-- ─── 2. ENABLE + FORCE RLS ──────────────────────────────────────────
ALTER TABLE "user_consents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_consents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ─── 3. RLS policies ────────────────────────────────────────────────
-- Default-deny: no tenant context AND no admin bypass → no rows.
DO $$ BEGIN
  CREATE POLICY user_consents_default_deny ON user_consents
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- Users can SELECT their own rows; staff + admin bypass see all.
DO $$ BEGIN
  CREATE POLICY user_consents_self_read ON user_consents
    FOR SELECT
    USING (
      user_id = app.current_user_id()
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- Users INSERT their own consent rows via withTenant.
DO $$ BEGIN
  CREATE POLICY user_consents_self_insert ON user_consents
    FOR INSERT
    WITH CHECK (
      user_id = app.current_user_id()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- No UPDATE / DELETE policy → append-only enforced by FORCE RLS + omission.

-- ─── 4. bomy_app role grants ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON "user_consents" TO bomy_app';
  END IF;
END
$$;
--> statement-breakpoint

-- ─── 5. platform_config tos_version seed ────────────────────────────
-- Bumping this value re-gates all existing users (their JWT currentTosVersion
-- goes stale; they are gated to /auth/consent on next sign-in).
INSERT INTO "platform_config" ("key", "value", "description")
VALUES (
  'tos_version',
  '"2026-06-17"'::jsonb,
  'Current ToS + Privacy Policy version string. Bumping forces re-consent.'
)
ON CONFLICT ("key") DO NOTHING;
