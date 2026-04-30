-- Stage 4: Membership & Subscriptions schema.
-- Adds subscription_status / voucher_type / dispatch_status enums,
-- extends revenue_source with processing_fee, creates 5 new tables
-- (member_subscriptions, brand_subscription_plans, brand_subscriptions,
-- vouchers, goodie_box_dispatches), and applies RLS per spec §3.2.
-- Also seeds 5 new platform_config keys per spec §3.3.

-- ─── Enum extension ──────────────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- older Postgres releases (pre-12 quirk). Each statement here is
-- applied via the migration runner one at a time, so this is safe.
--> statement-breakpoint
ALTER TYPE "public"."revenue_source" ADD VALUE IF NOT EXISTS 'processing_fee';

-- ─── New enums ───────────────────────────────────────────────────────────
--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'expired', 'cancelled', 'payment_failed');
--> statement-breakpoint
CREATE TYPE "public"."voucher_type" AS ENUM('fixed_myr', 'percentage', 'random_myr');
--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('pending', 'dispatched', 'delivered');

-- ─── member_subscriptions ────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "member_subscriptions" (
  "id"                       uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"                  uuid        NOT NULL,
  "status"                   "subscription_status" NOT NULL,
  "price_myr_sen"            bigint      NOT NULL,
  "period_start"             timestamptz NOT NULL,
  "period_end"               timestamptz NOT NULL,
  "hitpay_recurring_id"      text,
  "hitpay_payment_id"        text,
  "welcome_gift_dispatched"  boolean     NOT NULL DEFAULT false,
  "notified_days"            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  "cancelled_at"             timestamptz,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_subscriptions_user_idx" ON "member_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_subscriptions_status_idx" ON "member_subscriptions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_subscriptions_period_end_idx" ON "member_subscriptions" USING btree ("period_end");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_subscriptions_active_user_unique_idx"
  ON "member_subscriptions" USING btree ("user_id") WHERE status = 'active';

-- ─── brand_subscription_plans ────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_subscription_plans" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id"       uuid        NOT NULL,
  "term_months"    smallint    NOT NULL,
  "price_myr_sen"  bigint      NOT NULL,
  "discount_pct"   smallint    NOT NULL,
  "description"    text,
  "is_active"      boolean     NOT NULL DEFAULT false,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "brand_subscription_plans_term_chk"     CHECK (term_months IN (3, 6, 12)),
  CONSTRAINT "brand_subscription_plans_price_chk"    CHECK (price_myr_sen >= 0),
  CONSTRAINT "brand_subscription_plans_discount_chk" CHECK (discount_pct BETWEEN 5 AND 10)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_subscription_plans" ADD CONSTRAINT "brand_subscription_plans_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_subscription_plans_store_idx" ON "brand_subscription_plans" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_subscription_plans_active_idx" ON "brand_subscription_plans" USING btree ("is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_subscription_plans_store_term_unique_idx"
  ON "brand_subscription_plans" USING btree ("store_id", "term_months");

-- ─── brand_subscriptions ─────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_subscriptions" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"             uuid        NOT NULL,
  "store_id"            uuid        NOT NULL,
  "plan_id"             uuid        NOT NULL,
  "status"              "subscription_status" NOT NULL,
  "price_myr_sen"       bigint      NOT NULL,
  "discount_pct"        smallint    NOT NULL,
  "period_start"        timestamptz NOT NULL,
  "period_end"          timestamptz NOT NULL,
  "hitpay_payment_id"   text,
  "hitpay_fee_sen"      bigint,
  "bomy_commission_sen" bigint      NOT NULL,
  "brand_payout_sen"    bigint      NOT NULL,
  "brand_payout_at"     timestamptz,
  "cancelled_at"        timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  -- Commission rule: HitPay fee comes off the top, THEN the 90/10
  -- split applies. Enforced only on rows in `active` status — pending
  -- rows are created at checkout initiation before fee data arrives.
  CONSTRAINT "brand_subscriptions_split_chk" CHECK (
    status <> 'active'
    OR (
      hitpay_fee_sen IS NOT NULL
      AND bomy_commission_sen + brand_payout_sen + hitpay_fee_sen = price_myr_sen
    )
  ),
  CONSTRAINT "brand_subscriptions_discount_chk" CHECK (discount_pct BETWEEN 5 AND 10)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_subscriptions" ADD CONSTRAINT "brand_subscriptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_subscriptions" ADD CONSTRAINT "brand_subscriptions_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_subscriptions" ADD CONSTRAINT "brand_subscriptions_plan_id_brand_subscription_plans_id_fk"
    FOREIGN KEY ("plan_id") REFERENCES "public"."brand_subscription_plans"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_subscriptions_user_idx" ON "brand_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_subscriptions_store_idx" ON "brand_subscriptions" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_subscriptions_status_idx" ON "brand_subscriptions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_subscriptions_period_end_idx" ON "brand_subscriptions" USING btree ("period_end");

-- ─── vouchers ────────────────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vouchers" (
  "id"                    uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"               uuid         NOT NULL,
  "code"                  text         NOT NULL,
  "type"                  "voucher_type" NOT NULL,
  "fixed_amount_sen"      bigint,
  "percentage"            smallint,
  "random_resolved_sen"   bigint,
  "issued_month"          text         NOT NULL,
  "expires_at"            timestamptz  NOT NULL,
  "redeemed_at"           timestamptz,
  "redeemed_order_id"     uuid,
  "created_at"            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT "vouchers_issued_month_fmt_chk" CHECK (issued_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "vouchers_type_amount_chk" CHECK (
       (type = 'fixed_myr'   AND fixed_amount_sen    IS NOT NULL AND percentage IS NULL AND random_resolved_sen IS NULL)
    OR (type = 'percentage'  AND percentage          IS NOT NULL AND fixed_amount_sen IS NULL AND random_resolved_sen IS NULL)
    OR (type = 'random_myr'  AND random_resolved_sen IS NOT NULL AND fixed_amount_sen IS NULL AND percentage IS NULL)
  ),
  CONSTRAINT "vouchers_percentage_range_chk" CHECK (percentage IS NULL OR percentage BETWEEN 1 AND 100)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vouchers_code_unique_idx" ON "vouchers" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vouchers_user_month_unique_idx" ON "vouchers" USING btree ("user_id", "issued_month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_expires_at_idx" ON "vouchers" USING btree ("expires_at");

-- ─── goodie_box_dispatches ───────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goodie_box_dispatches" (
  "id"                uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"           uuid        NOT NULL,
  "quarter"           text        NOT NULL,
  "status"            "dispatch_status" NOT NULL DEFAULT 'pending',
  "shipping_name"     text        NOT NULL,
  "shipping_address"  jsonb       NOT NULL,
  "tracking_number"   text,
  "carrier"           text        NOT NULL DEFAULT 'pos_laju',
  "dispatched_at"     timestamptz,
  "notes"             text,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "goodie_box_dispatches_quarter_fmt_chk" CHECK (quarter ~ '^[0-9]{4}-Q[1-4]$')
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goodie_box_dispatches" ADD CONSTRAINT "goodie_box_dispatches_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "goodie_box_dispatches_user_quarter_unique_idx"
  ON "goodie_box_dispatches" USING btree ("user_id", "quarter");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goodie_box_dispatches_status_idx" ON "goodie_box_dispatches" USING btree ("status");

-- ─── ENABLE + FORCE RLS on all 5 new tables ──────────────────────────────
--> statement-breakpoint
ALTER TABLE "member_subscriptions"      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "member_subscriptions"      FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_subscription_plans"  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_subscription_plans"  FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_subscriptions"       ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_subscriptions"       FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vouchers"                  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vouchers"                  FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "goodie_box_dispatches"     ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "goodie_box_dispatches"     FORCE  ROW LEVEL SECURITY;

-- ─── Default-deny RESTRICTIVE policies ───────────────────────────────────
--> statement-breakpoint
CREATE POLICY member_subscriptions_default_deny ON member_subscriptions
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY brand_subscription_plans_default_deny ON brand_subscription_plans
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY brand_subscriptions_default_deny ON brand_subscriptions
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY vouchers_default_deny ON vouchers
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
--> statement-breakpoint
CREATE POLICY goodie_box_dispatches_default_deny ON goodie_box_dispatches
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- ─── Allow policies — member_subscriptions ───────────────────────────────
-- User reads own; staff/admin sees all. Inserts/updates only via the
-- API layer running under withAdmin (webhook handler) — gated to staff.
--> statement-breakpoint
CREATE POLICY member_subscriptions_self_read ON member_subscriptions
  FOR SELECT
  USING (
    user_id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );
--> statement-breakpoint
CREATE POLICY member_subscriptions_staff_write ON member_subscriptions
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- ─── Allow policies — brand_subscription_plans ───────────────────────────
-- Authenticated read of active plans (buyers shopping); seller_owner of
-- the parent store reads/writes their own plans (in any state); BOMY
-- staff sees and edits all (incl. flipping is_active).
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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

-- ─── Allow policies — brand_subscriptions ────────────────────────────────
-- Buyer reads own; seller_owner reads subs to their store; staff/admin
-- see all. Writes are staff/admin-only — all inserts come from the
-- webhook handler running under withAdmin.
--> statement-breakpoint
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
--> statement-breakpoint
CREATE POLICY brand_subscriptions_staff_write ON brand_subscriptions
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- ─── Allow policies — vouchers ───────────────────────────────────────────
-- Member reads own vouchers; staff sees all. Writes (issuance,
-- redemption) are staff-only — issuance job runs under withAdmin,
-- redemption is server-side at checkout under bomy_ops context.
--> statement-breakpoint
CREATE POLICY vouchers_self_read ON vouchers
  FOR SELECT
  USING (
    user_id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );
--> statement-breakpoint
CREATE POLICY vouchers_staff_write ON vouchers
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- ─── Allow policies — goodie_box_dispatches ──────────────────────────────
-- Member reads own dispatch (so they can see "shipped" + tracking);
-- staff manages all.
--> statement-breakpoint
CREATE POLICY goodie_box_dispatches_self_read ON goodie_box_dispatches
  FOR SELECT
  USING (
    user_id = app.current_user_id()
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );
--> statement-breakpoint
CREATE POLICY goodie_box_dispatches_staff_write ON goodie_box_dispatches
  FOR ALL
  USING (app.is_bomy_staff() OR app.is_admin_bypass())
  WITH CHECK (app.is_bomy_staff() OR app.is_admin_bypass());

-- ─── platform_config seeds (spec §3.3) ───────────────────────────────────
-- The platform_membership_price key was already seeded in 0001? No —
-- check: it isn't seeded yet. Seed it here alongside voucher knobs.
-- ON CONFLICT lets re-runs of this migration on a pre-seeded DB skip.
--> statement-breakpoint
INSERT INTO "platform_config" ("key", "value", "description") VALUES
  ('platform_membership_price_myr_sen', to_jsonb(7500),       'Annual #1 platform membership price in sen (RM75/yr).'),
  ('voucher_monthly_type',              to_jsonb('fixed_myr'::text), 'Voucher type for next monthly issuance: fixed_myr | percentage | random_myr.'),
  ('voucher_monthly_fixed_sen',         to_jsonb(500),        'Fixed-amount voucher value in sen (RM5) when type=fixed_myr.'),
  ('voucher_monthly_pct',               to_jsonb(10),         'Percentage voucher value when type=percentage.'),
  ('voucher_monthly_random_min_sen',    to_jsonb(200),        'Min sen for random_myr voucher (RM2).'),
  ('voucher_monthly_random_max_sen',    to_jsonb(1000),       'Max sen for random_myr voucher (RM10).')
ON CONFLICT ("key") DO NOTHING;

-- ─── bomy_app role grants on new tables ──────────────────────────────────
-- bomy_app is the non-superuser app role. Grant table-level CRUD on the
-- 5 new tables (RLS still enforces row visibility) and SELECT on the
-- 4 new sequences/serial defaults if any (none here — all UUIDs).
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "member_subscriptions"     TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_subscription_plans" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_subscriptions"      TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "vouchers"                 TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "goodie_box_dispatches"    TO bomy_app';
  END IF;
END
$$;
