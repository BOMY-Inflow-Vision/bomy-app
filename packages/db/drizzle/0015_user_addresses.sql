-- Migration 0015: user_addresses table + RLS + grants (saved address book).
--
-- Owner-scoped saved shipping addresses. One default per user enforced by a
-- partial unique index. Mirrors 0014_tos_consent.sql pattern (table + RLS +
-- grants in one file). Idempotent: IF NOT EXISTS / DO blocks guard all stmts.

-- ─── 1. user_addresses table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_addresses" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"        uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label"          text,
  "recipient_name" text        NOT NULL,
  "phone"          text        NOT NULL,
  "line1"          text        NOT NULL,
  "line2"          text,
  "city"           text        NOT NULL,
  "postcode"       text        NOT NULL,
  "state"          text        NOT NULL,
  "country"        text        NOT NULL DEFAULT 'MY',
  "is_default"     boolean     NOT NULL DEFAULT false,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_addresses_user_idx"
  ON "user_addresses" USING btree ("user_id");
--> statement-breakpoint

-- One default address per user (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS "user_addresses_one_default_idx"
  ON "user_addresses" USING btree ("user_id") WHERE "is_default";
--> statement-breakpoint

-- ─── 2. ENABLE + FORCE RLS ──────────────────────────────────────────
ALTER TABLE "user_addresses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_addresses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ─── 3. RLS policies (operation-specific, owner-scoped) ─────────────
DO $$ BEGIN
  CREATE POLICY user_addresses_default_deny ON user_addresses
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY user_addresses_self_select ON user_addresses
    FOR SELECT
    USING (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY user_addresses_self_insert ON user_addresses
    FOR INSERT
    WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY user_addresses_self_update ON user_addresses
    FOR UPDATE
    USING (user_id = app.current_user_id() OR app.is_admin_bypass())
    WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY user_addresses_self_delete ON user_addresses
    FOR DELETE
    USING (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ─── 4. bomy_app role grants ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "user_addresses" TO bomy_app';
  END IF;
END
$$;
