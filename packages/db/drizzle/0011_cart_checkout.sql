-- Migration 0011: Cart + Checkout — Stage 5 PR #31.
--
-- Adds the buyer-facing checkout surface schema:
--   • checkout_sessions, checkout_session_items, checkout_session_stores
--   • inventory_reservations
--   • new enums: checkout_session_status, inventory_reservation_status, psp_provider
--   • ALTER stores: flat_shipping_fee_sen (default 0)
--   • ALTER vouchers: drop redeemed_order_id placeholder; add 3 FK columns
--     pointing at checkout_sessions (safe — created earlier in this file)
--   • RLS: buyer SELECT only on checkout tables; all writes admin-bypass only;
--     inventory_reservations staff/admin SELECT, admin-only writes; default-deny
--     RESTRICTIVE on all 4
--   • platform_config seed: checkout_enabled = false. Flipped to true post-PR-#32
--     deploy + webhook smoke test pass.
--   • bomy_app role grants on all 4 new tables.
--
-- Self-contained: enums, tables, FKs, indexes, RLS, seed, grants — one file.
-- Idempotent: guarded by IF NOT EXISTS / DO blocks. Per 0009 convention.

-- ─── 1. Enums ────────────────────────────────────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."checkout_session_status" AS ENUM (
    'pending_payment', 'paid', 'failed', 'expired', 'cancelled',
    'payment_review_required', 'payment_review_resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."inventory_reservation_status" AS ENUM (
    'active', 'released', 'expired', 'converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."psp_provider" AS ENUM ('hitpay', 'stripe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. checkout_sessions ────────────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkout_sessions" (
  "id"                         uuid                       PRIMARY KEY NOT NULL,
  "user_id"                    uuid                       NOT NULL,
  "currency"                   "currency_code"            NOT NULL DEFAULT 'MYR',
  "status"                     "checkout_session_status"  NOT NULL DEFAULT 'pending_payment',
  "psp_provider"               "psp_provider"             NOT NULL DEFAULT 'hitpay',
  "psp_payment_request_id"     text,
  "psp_payment_id"             text,
  "psp_payment_url"            text,
  "psp_fee_sen"                bigint                     NOT NULL DEFAULT 0,
  "shipping_address"           jsonb                      NOT NULL,
  "total_catalog_sen"          bigint                     NOT NULL,
  "total_shipping_sen"         bigint                     NOT NULL,
  "voucher_id"                 uuid,
  "voucher_discount_sen"       bigint                     NOT NULL DEFAULT 0,
  "brand_discount_total_sen"   bigint                     NOT NULL DEFAULT 0,
  "total_buyer_pays_sen"       bigint                     NOT NULL,
  "payment_review_reason"      text,
  "resolution_note"            text,
  "resolved_by"                uuid,
  "expires_at"                 timestamptz                NOT NULL,
  "created_at"                 timestamptz                NOT NULL DEFAULT now(),
  "updated_at"                 timestamptz                NOT NULL DEFAULT now(),
  CONSTRAINT "checkout_sessions_payment_review_reason_chk" CHECK (
    payment_review_reason IS NULL OR payment_review_reason IN
      ('amount_mismatch', 'invalid_commission_config', 'voucher_claim_failed')
  ),
  CONSTRAINT "checkout_sessions_review_state_chk" CHECK (
    status NOT IN ('payment_review_required', 'payment_review_resolved')
    OR payment_review_reason IS NOT NULL
  ),
  CONSTRAINT "checkout_sessions_voucher_brand_xor_chk" CHECK (
    NOT (voucher_discount_sen > 0 AND brand_discount_total_sen > 0)
  ),
  CONSTRAINT "checkout_sessions_total_derived_chk" CHECK (
    total_buyer_pays_sen =
      total_catalog_sen + total_shipping_sen
      - voucher_discount_sen - brand_discount_total_sen
  ),
  CONSTRAINT "checkout_sessions_total_positive_chk"  CHECK (total_buyer_pays_sen > 0),
  CONSTRAINT "checkout_sessions_voucher_nonneg_chk"  CHECK (voucher_discount_sen >= 0),
  CONSTRAINT "checkout_sessions_brand_nonneg_chk"    CHECK (brand_discount_total_sen >= 0),
  CONSTRAINT "checkout_sessions_catalog_nonneg_chk"  CHECK (total_catalog_sen >= 0),
  CONSTRAINT "checkout_sessions_shipping_nonneg_chk" CHECK (total_shipping_sen >= 0),
  CONSTRAINT "checkout_sessions_voucher_cap_chk"     CHECK (voucher_discount_sen <= total_catalog_sen)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_voucher_id_vouchers_id_fk"
    FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_resolved_by_users_id_fk"
    FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_user_idx" ON "checkout_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_user_pending_idx"
  ON "checkout_sessions" USING btree ("user_id", "status")
  WHERE status = 'pending_payment';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_psp_payment_request_unique_idx"
  ON "checkout_sessions" USING btree ("psp_payment_request_id")
  WHERE psp_payment_request_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_psp_payment_id_unique_idx"
  ON "checkout_sessions" USING btree ("psp_payment_id")
  WHERE psp_payment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_status_expires_idx"
  ON "checkout_sessions" USING btree ("status", "expires_at");

-- ─── 3. checkout_session_items ───────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkout_session_items" (
  "id"                  uuid             PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_session_id" uuid             NOT NULL,
  "store_id"            uuid             NOT NULL,
  "variant_id"          uuid,
  "product_snapshot"    jsonb            NOT NULL,
  "variant_snapshot"    jsonb            NOT NULL,
  "quantity"            integer          NOT NULL,
  "currency"            "currency_code"  NOT NULL DEFAULT 'MYR',
  "unit_price_sen"      bigint           NOT NULL,
  "line_total_sen"      bigint           NOT NULL,
  "brand_discount_sen"  bigint           NOT NULL DEFAULT 0,
  "created_at"          timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "checkout_session_items_qty_chk"        CHECK (quantity > 0),
  CONSTRAINT "checkout_session_items_line_total_chk" CHECK (line_total_sen = quantity * unit_price_sen)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_session_items" ADD CONSTRAINT "checkout_session_items_session_id_fk"
    FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_session_items" ADD CONSTRAINT "checkout_session_items_store_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_session_items" ADD CONSTRAINT "checkout_session_items_variant_id_fk"
    FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_session_items_session_idx"
  ON "checkout_session_items" USING btree ("checkout_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_session_items_session_store_idx"
  ON "checkout_session_items" USING btree ("checkout_session_id", "store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_session_items_variant_idx"
  ON "checkout_session_items" USING btree ("variant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_session_items_store_idx"
  ON "checkout_session_items" USING btree ("store_id");

-- ─── 4. checkout_session_stores ──────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkout_session_stores" (
  "id"                        uuid             PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_session_id"       uuid             NOT NULL,
  "store_id"                  uuid             NOT NULL,
  "currency"                  "currency_code"  NOT NULL DEFAULT 'MYR',
  "retail_subtotal_sen"       bigint           NOT NULL,
  "brand_discount_sen"        bigint           NOT NULL DEFAULT 0,
  "discounted_subtotal_sen"   bigint           NOT NULL,
  "voucher_contribution_sen"  bigint           NOT NULL DEFAULT 0,
  "shipping_fee_sen"          bigint           NOT NULL,
  "psp_fee_allocated_sen"     bigint           NOT NULL DEFAULT 0,
  CONSTRAINT "checkout_session_stores_retail_nonneg_chk"     CHECK (retail_subtotal_sen >= 0),
  CONSTRAINT "checkout_session_stores_shipping_nonneg_chk"   CHECK (shipping_fee_sen >= 0),
  CONSTRAINT "checkout_session_stores_brand_nonneg_chk"      CHECK (brand_discount_sen >= 0),
  CONSTRAINT "checkout_session_stores_brand_cap_chk"         CHECK (brand_discount_sen <= retail_subtotal_sen),
  CONSTRAINT "checkout_session_stores_discounted_chk"        CHECK (discounted_subtotal_sen = retail_subtotal_sen - brand_discount_sen),
  CONSTRAINT "checkout_session_stores_discounted_nonneg_chk" CHECK (discounted_subtotal_sen >= 0),
  CONSTRAINT "checkout_session_stores_voucher_nonneg_chk"    CHECK (voucher_contribution_sen >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_session_stores" ADD CONSTRAINT "checkout_session_stores_session_id_fk"
    FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checkout_session_stores" ADD CONSTRAINT "checkout_session_stores_store_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_session_stores_uniq"
  ON "checkout_session_stores" USING btree ("checkout_session_id", "store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_session_stores_session_idx"
  ON "checkout_session_stores" USING btree ("checkout_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_session_stores_store_idx"
  ON "checkout_session_stores" USING btree ("store_id");

-- ─── 5. inventory_reservations ───────────────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_reservations" (
  "id"                  uuid                            PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "variant_id"          uuid                            NOT NULL,
  "checkout_session_id" uuid                            NOT NULL,
  "quantity"            integer                         NOT NULL,
  "status"              "inventory_reservation_status"  NOT NULL DEFAULT 'active',
  "expires_at"          timestamptz                     NOT NULL,
  "created_at"          timestamptz                     NOT NULL DEFAULT now(),
  "updated_at"          timestamptz                     NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_reservations_qty_chk" CHECK (quantity > 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_fk"
    FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_session_id_fk"
    FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_reservations_status_expires_idx"
  ON "inventory_reservations" USING btree ("status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_reservations_session_idx"
  ON "inventory_reservations" USING btree ("checkout_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_reservations_variant_idx"
  ON "inventory_reservations" USING btree ("variant_id");

-- ─── 6. ALTER stores: flat_shipping_fee_sen ──────────────────────────────
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "flat_shipping_fee_sen" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stores" ADD CONSTRAINT "stores_flat_shipping_fee_sen_chk"
    CHECK (flat_shipping_fee_sen >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 7. ALTER vouchers: drop placeholder, add 3 FK columns + index ───────
--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "reserved_checkout_session_id" uuid;
--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "reserved_at"                  timestamptz;
--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "redeemed_checkout_session_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_reserved_checkout_session_id_fk"
    FOREIGN KEY ("reserved_checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_redeemed_checkout_session_id_fk"
    FOREIGN KEY ("redeemed_checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "redeemed_order_id";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_available_user_idx"
  ON "vouchers" USING btree ("user_id", "expires_at")
  WHERE redeemed_at IS NULL AND reserved_checkout_session_id IS NULL;

-- ─── 8. RLS: enable + force on the 4 new tables ──────────────────────────
--> statement-breakpoint
ALTER TABLE "checkout_sessions"       ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checkout_sessions"       FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checkout_session_items"  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checkout_session_items"  FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checkout_session_stores" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checkout_session_stores" FORCE  ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inventory_reservations"  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inventory_reservations"  FORCE  ROW LEVEL SECURITY;

-- ─── 9. Default-deny RESTRICTIVE policies ────────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_sessions_default_deny ON checkout_sessions
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_items_default_deny ON checkout_session_items
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_stores_default_deny ON checkout_session_stores
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY inventory_reservations_default_deny ON inventory_reservations
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 10. checkout_sessions policies ──────────────────────────────────────
-- Buyer reads own. Staff/admin read all. All writes admin-bypass only —
-- production writes happen inside withAdmin (per spec §2.7). A
-- buyer-scoped withTenant call cannot mutate checkout/payment rows.
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_sessions_buyer_select ON checkout_sessions
    FOR SELECT
    USING (
      app.current_user_id() = user_id
      OR app.is_bomy_staff()
      OR app.is_admin_bypass()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_sessions_admin_insert ON checkout_sessions
    FOR INSERT
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_sessions_admin_update ON checkout_sessions
    FOR UPDATE
    USING (app.is_admin_bypass())
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_sessions_admin_delete ON checkout_sessions
    FOR DELETE
    USING (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 11. checkout_session_items policies ─────────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_items_buyer_select ON checkout_session_items
    FOR SELECT
    USING (
      app.is_admin_bypass()
      OR app.is_bomy_staff()
      OR EXISTS (
        SELECT 1 FROM checkout_sessions cs
        WHERE cs.id = checkout_session_items.checkout_session_id
          AND cs.user_id = app.current_user_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_items_admin_insert ON checkout_session_items
    FOR INSERT WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_items_admin_update ON checkout_session_items
    FOR UPDATE
    USING (app.is_admin_bypass())
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_items_admin_delete ON checkout_session_items
    FOR DELETE USING (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 12. checkout_session_stores policies ────────────────────────────────
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_stores_buyer_select ON checkout_session_stores
    FOR SELECT
    USING (
      app.is_admin_bypass()
      OR app.is_bomy_staff()
      OR EXISTS (
        SELECT 1 FROM checkout_sessions cs
        WHERE cs.id = checkout_session_stores.checkout_session_id
          AND cs.user_id = app.current_user_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_stores_admin_insert ON checkout_session_stores
    FOR INSERT WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_stores_admin_update ON checkout_session_stores
    FOR UPDATE
    USING (app.is_admin_bypass())
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY checkout_session_stores_admin_delete ON checkout_session_stores
    FOR DELETE USING (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 13. inventory_reservations policies ─────────────────────────────────
-- Staff/admin may SELECT for ops console. All writes admin-bypass only.
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY inventory_reservations_staff_select ON inventory_reservations
    FOR SELECT USING (app.is_admin_bypass() OR app.is_bomy_staff());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY inventory_reservations_admin_insert ON inventory_reservations
    FOR INSERT WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY inventory_reservations_admin_update ON inventory_reservations
    FOR UPDATE
    USING (app.is_admin_bypass())
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY inventory_reservations_admin_delete ON inventory_reservations
    FOR DELETE USING (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 14. checkout_enabled seed (false) ───────────────────────────────────
-- Master gate for /checkout server action. Flip to true ONLY after PR #32
-- webhook fan-out is live, smoke-tested, and ops accepts
-- stores.flat_shipping_fee_sen values per active store.
--> statement-breakpoint
INSERT INTO platform_config (key, value, description)
VALUES (
  'checkout_enabled',
  'false'::jsonb,
  'Master gate for /checkout server action. Flip true only after PR #32 webhook fan-out is live, smoke-tested, and ops accepts current stores.flat_shipping_fee_sen values.'
)
ON CONFLICT (key) DO NOTHING;

-- ─── 15. bomy_app role grants on all 4 new tables ────────────────────────
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "checkout_sessions"       TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "checkout_session_items"  TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "checkout_session_stores" TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory_reservations"  TO bomy_app';
  END IF;
END
$$;
