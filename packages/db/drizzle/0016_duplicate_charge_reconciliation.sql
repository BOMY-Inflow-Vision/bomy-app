-- Migration 0016: duplicate_charges + reconciliation ledger source.
-- Records duplicate subscription charges (abandoned-checkout re-pay; recurring
-- charge on an already-active membership) for admin-reviewed refund. Self-contained:
-- enum value, status type, table, constraints, indexes, RLS, grants. Mirrors the
-- 0008_admin_bypass_audit pattern. Each statement is idempotent. src/rls/policies.sql
-- documents these policies but is not applied at runtime.

ALTER TYPE "revenue_source" ADD VALUE IF NOT EXISTS 'duplicate_charge';
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "duplicate_charge_status" AS ENUM ('detected', 'refund_pending', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "duplicate_charges" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_type" text NOT NULL,
  "subscription_id"   uuid NOT NULL,
  "user_id"           uuid NOT NULL,
  "hitpay_payment_id" text NOT NULL,
  "amount_sen"        bigint NOT NULL,
  "currency"          "currency_code" NOT NULL,
  "status"            "duplicate_charge_status" NOT NULL DEFAULT 'detected',
  "hitpay_refund_id"  text,
  "resolved_by"       uuid,
  "detected_at"       timestamptz NOT NULL DEFAULT now(),
  "resolved_at"       timestamptz,
  CONSTRAINT "duplicate_charges_amount_positive_chk" CHECK ("amount_sen" > 0),
  CONSTRAINT "duplicate_charges_subscription_type_chk"
    CHECK ("subscription_type" IN ('member_subscription', 'brand_subscription'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "duplicate_charges_hitpay_payment_id_unique_idx"
  ON "duplicate_charges" USING btree ("hitpay_payment_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "duplicate_charges_hitpay_refund_id_unique_idx"
  ON "duplicate_charges" USING btree ("hitpay_refund_id")
  WHERE "hitpay_refund_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "duplicate_charges_status_idx"
  ON "duplicate_charges" USING btree ("status");
--> statement-breakpoint

ALTER TABLE "duplicate_charges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "duplicate_charges" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_default_deny ON duplicate_charges
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_staff_read ON duplicate_charges
    FOR SELECT
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_bypass_insert ON duplicate_charges
    FOR INSERT
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_bypass_update ON duplicate_charges
    FOR UPDATE
    USING (app.is_admin_bypass())
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "duplicate_charges" TO bomy_app';
  END IF;
END
$$;
