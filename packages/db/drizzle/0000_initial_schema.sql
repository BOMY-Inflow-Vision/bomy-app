-- Initial BOMY schema + RLS policies.
-- Applied once by scripts/migrate.mjs; tracked in _bomy_migrations.
-- Schema is derived from src/schema/*.ts; RLS from src/rls/policies.sql.

-- ─── Enums ────────────────────────────────────────────────────────────────

CREATE TYPE "public"."user_role" AS ENUM('buyer', 'seller_staff', 'seller_owner', 'bomy_ops', 'bomy_admin', 'bomy_finance');
--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('pending', 'active', 'suspended');
--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('MYR', 'USD');
--> statement-breakpoint
CREATE TYPE "public"."revenue_source" AS ENUM('regular_order', 'brand_subscription', 'platform_subscription', 'goodie_box_cogs', 'voucher_fund', 'refund', 'referral_grant');
--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');

-- ─── Tables ───────────────────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "store_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_config_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid,
	"key" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"account" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"revenue_source" "revenue_source" NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text,
	"kyc_status" text,
	"compliance_flags" jsonb,
	CONSTRAINT "ledger_entries_amount_positive_chk" CHECK ("amount_minor" > 0)
);

-- ─── Foreign keys ─────────────────────────────────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_config" ADD CONSTRAINT "platform_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_config_audit" ADD CONSTRAINT "platform_config_audit_config_id_platform_config_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."platform_config"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_config_audit" ADD CONSTRAINT "platform_config_audit_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_idx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stores_slug_unique_idx" ON "stores" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stores_owner_idx" ON "stores" USING btree ("owner_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_config_key_unique_idx" ON "platform_config" USING btree ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_config_audit_key_idx" ON "platform_config_audit" USING btree ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_config_audit_changed_at_idx" ON "platform_config_audit" USING btree ("changed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_idempotency_direction_unique_idx" ON "ledger_entries" USING btree ("idempotency_key", "direction");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_reference_idx" ON "ledger_entries" USING btree ("reference_type", "reference_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_created_at_idx" ON "ledger_entries" USING btree ("created_at");

-- ─── RLS: bomy_admin role ─────────────────────────────────────────────────
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_admin') THEN
    CREATE ROLE bomy_admin NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- ─── RLS: app schema + helper functions ──────────────────────────────────
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_admin_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), 'false') = 'true';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_role', true), '');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_bomy_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_user_role() IN ('bomy_ops', 'bomy_admin', 'bomy_finance');
$$;

-- ─── RLS: ENABLE + FORCE on all tables ───────────────────────────────────
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stores FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_config FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_config_audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_config_audit FORCE ROW LEVEL SECURITY;

-- ─── RLS: default-deny (RESTRICTIVE) ─────────────────────────────────────
--> statement-breakpoint
CREATE POLICY users_default_deny ON users
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY stores_default_deny ON stores
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY ledger_entries_default_deny ON ledger_entries
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY platform_config_default_deny ON platform_config
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY platform_config_audit_default_deny ON platform_config_audit
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- ─── RLS: explicit allow policies ────────────────────────────────────────
--> statement-breakpoint
CREATE POLICY users_self_read ON users
  FOR SELECT
  USING (
    id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );
--> statement-breakpoint
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
--> statement-breakpoint
CREATE POLICY users_insert_staff_only ON users
  FOR INSERT
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY stores_owner_read ON stores
  FOR SELECT
  USING (
    owner_id = app.current_user_id()
    OR status = 'active'
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );
--> statement-breakpoint
CREATE POLICY stores_owner_update ON stores
  FOR UPDATE
  USING (owner_id = app.current_user_id() OR app.is_admin_bypass())
  WITH CHECK (owner_id = app.current_user_id() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY stores_owner_insert ON stores
  FOR INSERT
  WITH CHECK (owner_id = app.current_user_id() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY stores_staff_all ON stores
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY ledger_entries_staff_read ON ledger_entries
  FOR SELECT
  USING (app.is_bomy_staff() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY ledger_entries_insert ON ledger_entries
  FOR INSERT
  WITH CHECK (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY platform_config_staff_read ON platform_config
  FOR SELECT
  USING (app.is_bomy_staff() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY platform_config_staff_write ON platform_config
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY platform_config_audit_staff_read ON platform_config_audit
  FOR SELECT
  USING (app.is_bomy_staff() OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY platform_config_audit_insert ON platform_config_audit
  FOR INSERT
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());
