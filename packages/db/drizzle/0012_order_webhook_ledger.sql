-- packages/db/drizzle/0012_order_webhook_ledger.sql
-- Stage 5 PR #32: orders, order_items, order_payouts, processed_webhook_events.
-- RLS and seeds appended in Tasks 2 and 3.

BEGIN;

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE order_payment_status AS ENUM (
  'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
);

CREATE TYPE order_fulfilment_status AS ENUM (
  'processing', 'shipped', 'delivered', 'completed', 'cancelled'
);

CREATE TYPE order_payout_status AS ENUM (
  'pending', 'processing', 'completed', 'failed'
);

-- ── orders ────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id      uuid         NOT NULL REFERENCES checkout_sessions(id) ON DELETE RESTRICT,
  store_id                 uuid         NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  buyer_id                 uuid         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency                 currency_code NOT NULL DEFAULT 'MYR',
  shipping_address         jsonb        NOT NULL,
  shipping_fee_sen         bigint       NOT NULL,
  retail_subtotal_sen      bigint       NOT NULL,
  brand_discount_sen       bigint       NOT NULL DEFAULT 0,
  discounted_subtotal_sen  bigint       NOT NULL,
  voucher_contribution_sen bigint       NOT NULL DEFAULT 0,
  psp_fee_allocated_sen    bigint       NOT NULL DEFAULT 0,
  bomy_commission_sen      bigint       NOT NULL,
  bomy_commission_pct      integer      NOT NULL,
  seller_payout_sen        bigint       NOT NULL,
  payment_status           order_payment_status     NOT NULL DEFAULT 'pending',
  fulfilment_status        order_fulfilment_status  NOT NULL DEFAULT 'processing',
  carrier                  text,
  tracking_number          text,
  shipped_at               timestamptz,
  delivered_at             timestamptz,
  completed_at             timestamptz,
  refund_requested_at      timestamptz,
  refunded_at              timestamptz,
  refund_amount_sen        bigint,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),

  -- Journal balance: the load-bearing CHECK. Protects ledger integrity.
  CONSTRAINT orders_journal_balance CHECK (
    seller_payout_sen + bomy_commission_sen + psp_fee_allocated_sen
    = discounted_subtotal_sen + shipping_fee_sen - voucher_contribution_sen
  ),
  CONSTRAINT orders_discounted_check   CHECK (discounted_subtotal_sen = retail_subtotal_sen - brand_discount_sen),
  CONSTRAINT orders_commission_pct_range CHECK (bomy_commission_pct BETWEEN 0 AND 100),
  CONSTRAINT orders_retail_nneg        CHECK (retail_subtotal_sen >= 0),
  CONSTRAINT orders_shipping_nneg      CHECK (shipping_fee_sen >= 0),
  CONSTRAINT orders_brand_discount_nneg CHECK (brand_discount_sen >= 0),
  CONSTRAINT orders_brand_lte_retail   CHECK (brand_discount_sen <= retail_subtotal_sen),
  CONSTRAINT orders_discounted_nneg    CHECK (discounted_subtotal_sen >= 0),
  CONSTRAINT orders_voucher_nneg       CHECK (voucher_contribution_sen >= 0)
  -- bomy_commission_sen is NOT range-constrained: can be negative when voucher > BOMY share.
);

-- ── order_items ───────────────────────────────────────────────────────────────

CREATE TABLE order_items (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id         uuid         NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  variant_id       uuid         REFERENCES product_variants(id) ON DELETE SET NULL,
  currency         currency_code NOT NULL DEFAULT 'MYR',
  product_snapshot jsonb        NOT NULL,
  variant_snapshot jsonb        NOT NULL,
  quantity         integer      NOT NULL,
  unit_price_sen   bigint       NOT NULL,
  line_total_sen   bigint       NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT order_items_quantity_pos   CHECK (quantity > 0),
  CONSTRAINT order_items_line_total_chk CHECK (line_total_sen = quantity * unit_price_sen)
);

-- ── order_payouts ─────────────────────────────────────────────────────────────
-- No rows inserted in PR #32; admin-only insert ships in PR #33.

CREATE TABLE order_payouts (
  id                   uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid               NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  amount_sen           bigint             NOT NULL,
  currency             currency_code      NOT NULL DEFAULT 'MYR',
  psp_provider         psp_provider,
  psp_transfer_id      text,
  manual_ref           text,
  status               order_payout_status NOT NULL DEFAULT 'pending',
  reconciliation_notes text,
  triggered_by         uuid               NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  triggered_at         timestamptz        NOT NULL DEFAULT now(),
  completed_at         timestamptz
);

-- ── processed_webhook_events ──────────────────────────────────────────────────

CREATE TABLE processed_webhook_events (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  psp_provider psp_provider NOT NULL,
  psp_event_id text         NOT NULL,
  event_type   text         NOT NULL,
  payload_hash text         NOT NULL,
  processed_at timestamptz  NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX orders_checkout_session_idx ON orders (checkout_session_id);
CREATE INDEX orders_store_fulfilment_idx ON orders (store_id, fulfilment_status);
CREATE INDEX orders_buyer_payment_idx    ON orders (buyer_id, payment_status);

-- Belt-and-braces against duplicate fan-out. The handler in §3.6 step 7 uses
-- INSERT ... ON CONFLICT (checkout_session_id, store_id) DO NOTHING RETURNING id
-- and treats 0 rows as a duplicate-fan-out alert. Do NOT remove ON CONFLICT and
-- let the unique violation abort the withAdmin transaction — that rolls back the
-- admin_bypass_audit row (Bob B7, spec §2.4).
CREATE UNIQUE INDEX orders_session_store_unique ON orders (checkout_session_id, store_id);

CREATE INDEX order_items_order_idx   ON order_items (order_id);
CREATE INDEX order_items_store_idx   ON order_items (store_id);
CREATE INDEX order_items_variant_idx ON order_items (variant_id) WHERE variant_id IS NOT NULL;

CREATE INDEX order_payouts_order_idx  ON order_payouts (order_id);
CREATE INDEX order_payouts_status_idx ON order_payouts (status);

-- The unique constraint IS the idempotency gate.
CREATE UNIQUE INDEX processed_webhook_events_unique
  ON processed_webhook_events (psp_provider, psp_event_id);
CREATE INDEX processed_webhook_events_processed_at_idx
  ON processed_webhook_events (processed_at);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Pattern (Bob B1): RESTRICTIVE default-deny uses IS NOT NULL OR is_admin_bypass(),
-- NEVER USING (false). Bob B2: SELECT seller branches require explicit role check.
-- Bob B3: Every INSERT/UPDATE/DELETE requires is_admin_bypass() — no tenant writes.

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE  ROW LEVEL SECURITY;

CREATE POLICY orders_default_deny ON orders
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- Both SELECT branches are role-gated (Bob B2): a store owner in buyer context
-- must NOT see other buyers' orders / shipping snapshots.
CREATE POLICY orders_select ON orders
  FOR SELECT
  USING (
    app.is_admin_bypass()
    OR app.is_bomy_staff()
    OR (
      app.current_user_role() = 'buyer'
      AND buyer_id = app.current_user_id()
    )
    OR (
      app.current_user_role() = 'seller_owner'
      AND EXISTS (
        SELECT 1 FROM stores s
         WHERE s.id = orders.store_id
           AND s.owner_id = app.current_user_id()
      )
    )
  );

CREATE POLICY orders_admin_insert ON orders
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY orders_admin_update ON orders
  FOR UPDATE
  USING     (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY orders_admin_delete ON orders
  FOR DELETE USING (app.is_admin_bypass());

-- order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_items_default_deny ON order_items
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- Same role-gating as orders_select (Bob B2).
CREATE POLICY order_items_select ON order_items
  FOR SELECT
  USING (
    app.is_admin_bypass()
    OR app.is_bomy_staff()
    OR EXISTS (
      SELECT 1 FROM orders o
       WHERE o.id = order_items.order_id
         AND (
           (app.current_user_role() = 'buyer'
             AND o.buyer_id = app.current_user_id())
           OR (app.current_user_role() = 'seller_owner'
             AND EXISTS (
               SELECT 1 FROM stores s
                WHERE s.id = o.store_id
                  AND s.owner_id = app.current_user_id()
             ))
         )
    )
  );

CREATE POLICY order_items_admin_insert ON order_items
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY order_items_admin_update ON order_items
  FOR UPDATE
  USING     (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY order_items_admin_delete ON order_items
  FOR DELETE USING (app.is_admin_bypass());

-- order_payouts
ALTER TABLE order_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payouts FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_payouts_default_deny ON order_payouts
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- Buyer never sees payouts. Seller branch requires role = 'seller_owner' (Bob B2):
-- without this, a buyer-context user who owns a store would satisfy the EXISTS.
CREATE POLICY order_payouts_select ON order_payouts
  FOR SELECT
  USING (
    app.is_admin_bypass()
    OR app.is_bomy_staff()
    OR (
      app.current_user_role() = 'seller_owner'
      AND EXISTS (
        SELECT 1 FROM orders o JOIN stores s ON s.id = o.store_id
         WHERE o.id = order_payouts.order_id
           AND s.owner_id = app.current_user_id()
      )
    )
  );

CREATE POLICY order_payouts_admin_insert ON order_payouts
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY order_payouts_admin_update ON order_payouts
  FOR UPDATE
  USING     (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY order_payouts_admin_delete ON order_payouts
  FOR DELETE USING (app.is_admin_bypass());

-- processed_webhook_events: append-only, admin-only. No tenant access at all.
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY processed_webhook_events_default_deny ON processed_webhook_events
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

CREATE POLICY processed_webhook_events_admin_select ON processed_webhook_events
  FOR SELECT USING (app.is_admin_bypass());

CREATE POLICY processed_webhook_events_admin_insert ON processed_webhook_events
  FOR INSERT WITH CHECK (app.is_admin_bypass());
-- No UPDATE / DELETE policies — append-only by omission + RLS.

-- ── Role grants ───────────────────────────────────────────────────────────────
-- Mirror 0011_cart_checkout.sql §15: grant to bomy_app so the limited role
-- can reach these tables (RLS then enforces the actual access control). The
-- DO $$ guard skips silently when the role does not exist (fresh dev DBs
-- before infra/docker/init-bomy-app.sql has been applied).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "orders"                   TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "order_items"              TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "order_payouts"            TO bomy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "processed_webhook_events" TO bomy_app';
  END IF;
END
$$;

-- Seeds appended by Task 3. COMMIT deferred to Task 3.
