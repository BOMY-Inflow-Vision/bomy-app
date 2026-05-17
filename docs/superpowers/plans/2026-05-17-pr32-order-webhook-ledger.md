# PR #32 Order Webhook + Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Model:** Sonnet 4.6 (plan drafting). Implementation Tasks 1–12: **Opus 4.7** (RLS, ledger correctness, lock-order semantics are load-bearing).

**Goal:** Implement PR #32 (`feat/order-webhook-ledger`) — HitPay webhook fan-out for order payments: idempotency claim, PSP-fee capture, per-store commission split, `orders` + `order_items` row creation, double-entry ledger, voucher claim, and session/reservation status transitions. All in one atomic `withAdmin` transaction per event. Per spec `docs/superpowers/specs/2026-05-17-pr32-order-webhook-ledger-design.md` (Bob-approved at `dd670ae`).

**Architecture:** Migration 0012 lands four new tables (`orders`, `order_items`, `order_payouts`, `processed_webhook_events`) plus three new enums and `platform_config` seeds. A new dispatcher branch in the existing HitPay webhook route delegates order-payment events to `handleOrderPayment` before the brand-subscription path fires. `handleOrderPayment` runs a single `withAdmin` transaction that: (A) claims idempotency via `processed_webhook_events`, (B) locks the session row `FOR UPDATE`, (C) routes `failed` events before amount validation, (D) validates amount and `paymentId`, (E) guards with the session status second barrier, then (F) fans out to `fanOutPaid`. The failure path (`runFailureRelease`) mirrors PR #31's `compensateInitiation` but is webhook-driven. All five helper modules live under `apps/api/src/webhooks/hitpay/`.

**Tech Stack:** TypeScript strict, Drizzle ORM (Postgres 16), Fastify 5, Pino structured logs, Vitest with real Postgres. Money throughout as `bigint` sen. Lock order: `checkout_sessions → inventory_reservations → product_variants → vouchers` (matches PR #31 expiry job and compensate path).

**Reference:** Spec at `docs/superpowers/specs/2026-05-17-pr32-order-webhook-ledger-design.md` is committed at `dd670ae`. This plan dereferences the spec — tasks below say "per spec §X.Y" for anything load-bearing.

**Pre-conditions verified before starting:**

- Engineering branch `feat/order-webhook-ledger` cut from `main` at `0996222` (PR #31 merge commit).
- Spec is committed at `dd670ae` (plan adds the next commit on the design branch, not the engineering branch).
- `checkout_enabled` is `false` in production and staging. **Must remain `false` until PR #32 deploys and smoke tests pass (§1.3 runbook).**
- Docker stack running (`docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d`).

---

## Bob-flagged Correctness Invariants (surface explicitly in task steps)

These were caught across Bob R1–R3. They must appear in the relevant task checklist steps, not just be implied by "follow the spec."

| #   | Invariant                                                                                                                                                            | Task     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| B1  | RLS RESTRICTIVE uses `IS NOT NULL OR is_admin_bypass()`, never `USING (false)`                                                                                       | Task 2   |
| B2  | `orders`/`order_items`/`order_payouts` SELECT policies require explicit `current_user_role()` on seller branch                                                       | Task 2   |
| B3  | Every INSERT/UPDATE/DELETE policy requires `is_admin_bypass()` — no tenant writes                                                                                    | Task 2   |
| B4  | PSP fee parsed strictly and persisted on session before split math; park on unparseable or fee > gross                                                               | Task 8   |
| B5  | Failed-path routing fires BEFORE amount validation; `payment_request.failed` with missing/bad amount still releases                                                  | Task 8/9 |
| B6  | Session status guard (`pending_payment` check) fires BEFORE fan-out; second barrier even with fresh event id                                                         | Task 8   |
| B7  | DB-level belt-and-braces: `orders_session_store_unique` + `ON CONFLICT DO NOTHING RETURNING id`; 0 rows = log error + commit (never throw)                           | Task 8   |
| B8  | `paymentId` guard on completed events: empty `paymentId` → `parkPaymentReview("amount_mismatch")`                                                                    | Task 8   |
| B9  | Failed-path `psp_payment_id` conditional set: Drizzle spread only when `args.paymentId` is non-empty                                                                 | Task 9   |
| B10 | Seller-payout and processing-fee ledger legs gated on `> 0n`; `orders.seller_payout_sen` still writes 0                                                              | Task 8   |
| B11 | `claimEvent` returns `ClaimResult`; on `owned: false` compare `payload_hash` + `event_type`; log `webhook_event_id_collision` at error on mismatch; still return 200 | Task 7   |

---

## File Structure

### Files created

| Path                                                 | Purpose                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/db/drizzle/0012_order_webhook_ledger.sql`  | Full migration: enums, tables, CHECKs, indexes, RLS, grants, seeds            |
| `packages/db/src/schema/orders.ts`                   | Drizzle orders table definition                                               |
| `packages/db/src/schema/order_items.ts`              | Drizzle order_items table definition                                          |
| `packages/db/src/schema/order_payouts.ts`            | Drizzle order_payouts table definition                                        |
| `packages/db/src/schema/processed_webhook_events.ts` | Drizzle processed_webhook_events definition                                   |
| `packages/db/tests/order_webhook.test.ts`            | Schema + RLS integration tests (tests 1–10c)                                  |
| `apps/api/src/webhooks/hitpay/commission.ts`         | Pure functions: `allocatePspFee`, `computeStoreSplit`, `assertJournalBalance` |
| `apps/api/src/webhooks/hitpay/idempotency.ts`        | `deriveEventIdentity`, `claimEvent`, `ClaimResult`                            |
| `apps/api/src/webhooks/hitpay/order-fanout.ts`       | `handleOrderPayment`, `fanOutPaid`, `selectSessionForUpdate`                  |
| `apps/api/src/webhooks/hitpay/failure-release.ts`    | `runFailureRelease`                                                           |
| `apps/api/src/webhooks/hitpay/park-review.ts`        | `parkPaymentReview`, `runConsistencyCheck`, `warnOnEventCollision`            |
| `apps/api/tests/webhooks/hitpay-order.test.ts`       | Handler integration tests (tests 14–35)                                       |

### Files modified

| Path                                     | Change                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/enums.ts`        | Add `orderPaymentStatusEnum`, `orderFulfilmentStatusEnum`, `orderPayoutStatusEnum`             |
| `packages/db/src/schema/index.ts`        | Re-export 4 new schema modules                                                                 |
| `packages/db/src/types.ts`               | Add 3 status arrays + `OrderPaymentStatus`, `OrderFulfilmentStatus`, `OrderPayoutStatus` types |
| `packages/db/src/rls/policies.sql`       | Append 4 new table policy blocks (canonical RLS doc)                                           |
| `apps/api/src/routes/webhooks/hitpay.ts` | Add order-payment dispatcher branch (before brand-sub branch)                                  |
| `apps/api/tests/webhooks/hitpay.test.ts` | Add routing tests 36–38                                                                        |

---

## Implementation conventions

**`@bomy/db` import shape** — mirror Task 4 schema files and PR #31 job conventions:

```ts
import { makeDb, schema, withAdmin } from "@bomy/db"
import type { Database } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client
}
// Usage: getDb().db inside withAdmin; schema.orders, schema.processedWebhookEvents …
```

**`SYSTEM_ACTOR`** — not exported from `@bomy/db`; define per-file:

```ts
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const
```

**Money** — always `bigint` sen. BigInt division is floor division — never use floats. `parseSen` already exists in `apps/api/src/routes/webhooks/hitpay.ts`; import it from there or inline a copy in `commission.ts` if it is not exported.

**Lock order** — `checkout_sessions → inventory_reservations → product_variants → vouchers`. Never deviate. See spec §3.3.

**Webhook 200 contract** — the handler never throws after the HMAC gate. Business errors park into review or log + return 200. The `admin_bypass_audit` row must persist (Bob B7).

---

## Task 1: Migration 0012 — enums + tables + CHECKs + indexes

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Why split from Tasks 2–3:** Enums and table DDL are the foundation; reviewers can read the schema before the policy and seed blocks. The migration file is built incrementally across Tasks 1–3 and applied only after Task 3 completes the `COMMIT`.

**Files:**

- Create: `packages/db/drizzle/0012_order_webhook_ledger.sql`

- [ ] **Step 1: Create the migration file with BEGIN, enums, tables, indexes**

```sql
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

-- RLS and seeds appended by Tasks 2 and 3. COMMIT deferred to Task 3.
```

> **Note:** Do NOT run `pnpm --filter @bomy/db migrate` after this task. The migration file is incomplete (no RLS, no seeds, no COMMIT). Migration runs only after Task 3 closes the file.

- [ ] **Step 2: Commit**

```bash
git add packages/db/drizzle/0012_order_webhook_ledger.sql
git commit -m "feat(db): migration 0012 — orders/order_items/order_payouts/processed_webhook_events enums, tables, indexes"
```

---

## Task 2: Migration 0012 — RLS policies + role grants

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Modify: `packages/db/drizzle/0012_order_webhook_ledger.sql` (append RLS block before placeholder comment)
- Modify: `packages/db/src/rls/policies.sql` (append matching policy definitions for canonical RLS doc)

- [ ] **Step 1: Append RLS block to the migration file**

Append the following block after the last `CREATE INDEX` line (replacing the `-- RLS and seeds …` placeholder comment):

```sql
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
-- can reach these tables (RLS then enforces the actual access control).

GRANT SELECT, INSERT, UPDATE, DELETE ON orders                  TO bomy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_items             TO bomy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_payouts           TO bomy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON processed_webhook_events TO bomy_app;

-- Seeds appended by Task 3. COMMIT deferred to Task 3.
```

- [ ] **Step 2: Append matching policy blocks to `packages/db/src/rls/policies.sql`**

Open `packages/db/src/rls/policies.sql` and append after the last block (PR #31 checkout policies end around line 736). Add a section header `-- ── PR #32: orders / order_items / order_payouts / processed_webhook_events ──` followed by the same 4-table policy SQL from Step 1 (copy verbatim so canonical RLS doc stays in sync).

- [ ] **Step 3: Commit**

```bash
git add packages/db/drizzle/0012_order_webhook_ledger.sql packages/db/src/rls/policies.sql
git commit -m "feat(db): migration 0012 — RLS policies + role grants for orders, order_items, order_payouts, processed_webhook_events"
```

---

## Task 3: Migration 0012 — platform_config seeds + apply

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Modify: `packages/db/drizzle/0012_order_webhook_ledger.sql` (append seeds + COMMIT)

- [ ] **Step 1: Append seeds + COMMIT to close the migration file**

Replace the trailing `-- Seeds appended by Task 3. COMMIT deferred to Task 3.` comment with:

```sql
-- ── platform_config seeds ─────────────────────────────────────────────────────

INSERT INTO platform_config (key, value, description) VALUES
  (
    'regular_order_commission_pct',
    '25'::jsonb,
    'BOMY platform commission for regular (non-brand-subscription) orders. ' ||
    'Applied at webhook fan-out time. Net-of-PSP-fees. Snapshot stored on orders.bomy_commission_pct. ' ||
    'Editing this rate is gated behind MFA / two-admin approval (Stage 5 §8).'
  ),
  (
    'order_auto_complete_days',
    '7'::jsonb,
    'Days from delivered_at before OrderAutoCompleteJob (PR #33) transitions delivered → completed.'
  ),
  (
    'order_auto_delivered_days',
    '30'::jsonb,
    'Days from shipped_at before OrderAutoCompleteJob assumes delivery (shipped → delivered fallback).'
  )
ON CONFLICT (key) DO NOTHING;

-- checkout_enabled is NOT seeded here. It stays at false (PR #31 seed value)
-- until the post-deploy runbook (spec §1.3) flips it.

COMMIT;
```

- [ ] **Step 2: Apply the migration**

```bash
pnpm --filter @bomy/db migrate
```

Expected: migration 0012 applied, no errors. Verify:

```bash
psql $DATABASE_URL -c "\dt orders order_items order_payouts processed_webhook_events"
psql $DATABASE_URL -c "SELECT key FROM platform_config WHERE key LIKE 'order%' OR key = 'regular_order_commission_pct'"
```

Expected: 4 tables visible; 3 platform_config keys returned.

- [ ] **Step 3: Commit**

```bash
git add packages/db/drizzle/0012_order_webhook_ledger.sql
git commit -m "feat(db): migration 0012 — platform_config seeds (regular_order_commission_pct=25, auto-complete/delivered days) + COMMIT"
```

---

## Task 4: Drizzle schema modules + type exports

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Modify: `packages/db/src/schema/enums.ts` (+3 enums)
- Create: `packages/db/src/schema/orders.ts`
- Create: `packages/db/src/schema/order_items.ts`
- Create: `packages/db/src/schema/order_payouts.ts`
- Create: `packages/db/src/schema/processed_webhook_events.ts`
- Modify: `packages/db/src/schema/index.ts` (+4 re-exports)
- Modify: `packages/db/src/types.ts` (+3 status arrays + types)

- [ ] **Step 1: Add 3 enums to `packages/db/src/schema/enums.ts`**

Find the existing enum block (e.g., after `inventoryReservationStatusEnum`) and add:

```ts
export const orderPaymentStatusEnum = pgEnum("order_payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
])

export const orderFulfilmentStatusEnum = pgEnum("order_fulfilment_status", [
  "processing",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
])

export const orderPayoutStatusEnum = pgEnum("order_payout_status", [
  "pending",
  "processing",
  "completed",
  "failed",
])
```

- [ ] **Step 2: Create `packages/db/src/schema/orders.ts`**

```ts
// packages/db/src/schema/orders.ts
import { bigint, check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { currencyCodeEnum, orderFulfilmentStatusEnum, orderPaymentStatusEnum } from "./enums.js"
import { checkoutSessions } from "./checkout_sessions.js"
import { stores } from "./stores.js"
import { users } from "./users.js"

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: currencyCodeEnum("currency").notNull().default("MYR"),
    shippingAddress: jsonb("shipping_address").notNull(),
    shippingFeeSen: bigint("shipping_fee_sen", { mode: "bigint" }).notNull(),
    retailSubtotalSen: bigint("retail_subtotal_sen", { mode: "bigint" }).notNull(),
    brandDiscountSen: bigint("brand_discount_sen", { mode: "bigint" }).notNull().default(0n),
    discountedSubtotalSen: bigint("discounted_subtotal_sen", { mode: "bigint" }).notNull(),
    voucherContributionSen: bigint("voucher_contribution_sen", { mode: "bigint" })
      .notNull()
      .default(0n),
    pspFeeAllocatedSen: bigint("psp_fee_allocated_sen", { mode: "bigint" }).notNull().default(0n),
    bomyCommissionSen: bigint("bomy_commission_sen", { mode: "bigint" }).notNull(),
    bomyCommissionPct: integer("bomy_commission_pct").notNull(),
    sellerPayoutSen: bigint("seller_payout_sen", { mode: "bigint" }).notNull(),
    paymentStatus: orderPaymentStatusEnum("payment_status").notNull().default("pending"),
    fulfilmentStatus: orderFulfilmentStatusEnum("fulfilment_status")
      .notNull()
      .default("processing"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    refundRequestedAt: timestamp("refund_requested_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundAmountSen: bigint("refund_amount_sen", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "orders_journal_balance",
      sql`${t.sellerPayoutSen} + ${t.bomyCommissionSen} + ${t.pspFeeAllocatedSen} = ${t.discountedSubtotalSen} + ${t.shippingFeeSen} - ${t.voucherContributionSen}`,
    ),
    check(
      "orders_discounted_check",
      sql`${t.discountedSubtotalSen} = ${t.retailSubtotalSen} - ${t.brandDiscountSen}`,
    ),
    check("orders_commission_pct_range", sql`${t.bomyCommissionPct} BETWEEN 0 AND 100`),
    check("orders_retail_nneg", sql`${t.retailSubtotalSen} >= 0`),
    check("orders_shipping_nneg", sql`${t.shippingFeeSen} >= 0`),
    check("orders_brand_discount_nneg", sql`${t.brandDiscountSen} >= 0`),
    check("orders_brand_lte_retail", sql`${t.brandDiscountSen} <= ${t.retailSubtotalSen}`),
    check("orders_discounted_nneg", sql`${t.discountedSubtotalSen} >= 0`),
    check("orders_voucher_nneg", sql`${t.voucherContributionSen} >= 0`),
  ],
)
```

- [ ] **Step 3: Create `packages/db/src/schema/order_items.ts`**

```ts
// packages/db/src/schema/order_items.ts
import { bigint, check, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { currencyCodeEnum } from "./enums.js"
import { orders } from "./orders.js"
import { productVariants } from "./product_variants.js"
import { stores } from "./stores.js"

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    currency: currencyCodeEnum("currency").notNull().default("MYR"),
    productSnapshot: jsonb("product_snapshot").notNull(),
    variantSnapshot: jsonb("variant_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceSen: bigint("unit_price_sen", { mode: "bigint" }).notNull(),
    lineTotalSen: bigint("line_total_sen", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("order_items_quantity_pos", sql`${t.quantity} > 0`),
    check("order_items_line_total_chk", sql`${t.lineTotalSen} = ${t.quantity} * ${t.unitPriceSen}`),
  ],
)
```

- [ ] **Step 4: Create `packages/db/src/schema/order_payouts.ts`**

```ts
// packages/db/src/schema/order_payouts.ts
import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { currencyCodeEnum, orderPayoutStatusEnum, pspProviderEnum } from "./enums.js"
import { orders } from "./orders.js"
import { users } from "./users.js"

export const orderPayouts = pgTable("order_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  amountSen: bigint("amount_sen", { mode: "bigint" }).notNull(),
  currency: currencyCodeEnum("currency").notNull().default("MYR"),
  pspProvider: pspProviderEnum("psp_provider"),
  pspTransferId: text("psp_transfer_id"),
  manualRef: text("manual_ref"),
  status: orderPayoutStatusEnum("status").notNull().default("pending"),
  reconciliationNotes: text("reconciliation_notes"),
  triggeredBy: uuid("triggered_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
})
```

- [ ] **Step 5: Create `packages/db/src/schema/processed_webhook_events.ts`**

```ts
// packages/db/src/schema/processed_webhook_events.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { pspProviderEnum } from "./enums.js"

export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pspProvider: pspProviderEnum("psp_provider").notNull(),
  pspEventId: text("psp_event_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadHash: text("payload_hash").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 6: Update `packages/db/src/schema/index.ts`**

Add 4 re-exports in alphabetical order among the existing exports:

```ts
export * from "./order_items.js"
export * from "./order_payouts.js"
export * from "./orders.js"
export * from "./processed_webhook_events.js"
```

- [ ] **Step 7: Update `packages/db/src/types.ts`**

Add after the existing checkout-session status block:

```ts
export const ORDER_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
] as const
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number]

export const ORDER_FULFILMENT_STATUSES = [
  "processing",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
] as const
export type OrderFulfilmentStatus = (typeof ORDER_FULFILMENT_STATUSES)[number]

export const ORDER_PAYOUT_STATUSES = ["pending", "processing", "completed", "failed"] as const
export type OrderPayoutStatus = (typeof ORDER_PAYOUT_STATUSES)[number]
```

- [ ] **Step 8: Typecheck**

```bash
pnpm --filter @bomy/db typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/orders.ts packages/db/src/schema/order_items.ts \
        packages/db/src/schema/order_payouts.ts packages/db/src/schema/processed_webhook_events.ts \
        packages/db/src/schema/enums.ts packages/db/src/schema/index.ts packages/db/src/types.ts
git commit -m "feat(db): drizzle schema modules for orders, order_items, order_payouts, processed_webhook_events + type exports"
```

---

## Task 5: Schema + RLS tests

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Create: `packages/db/tests/order_webhook.test.ts`

Tests 1–10c from spec §7.1. Mirror the pattern of `packages/db/tests/cart_checkout.test.ts` (seeding helpers, `withTenant`, `withAdmin`, `sql` raw execute for CHECK violation tests).

- [ ] **Step 1: Create the test file**

```ts
// packages/db/tests/order_webhook.test.ts
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"

import { schema, withAdmin, withTenant } from "@bomy/db"

import { setupTestDb, type TestDb } from "./helpers/setup"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

describe("order_webhook migration", () => {
  let db: TestDb
  beforeAll(async () => {
    db = await setupTestDb()
  })
  afterAll(async () => {
    await db.cleanup()
  })
  beforeEach(async () => {
    await db.truncateAll()
  })

  // ── tests 1–5: schema CHECKs ────────────────────────────────────────────────

  test("1: orders rejects journal balance violation", async () => {
    // Insert with seller_payout + bomy_commission + psp_fee ≠ discounted + shipping - voucher
    /* seed buyer, store, checkout_session; raw INSERT with mismatched columns;
       expect rejects with /orders_journal_balance/ */
  })

  test("2: orders rejects discounted_subtotal ≠ retail − brand_discount", async () => {
    /* seed; raw INSERT with discounted_subtotal_sen ≠ retail_subtotal_sen - brand_discount_sen */
  })

  test("3: orders rejects bomy_commission_pct = 101", async () => {
    /* seed; raw INSERT with bomy_commission_pct = 101; expect rejects with /orders_commission_pct_range/ */
  })

  test("4: orders ACCEPTS bomy_commission_sen < 0 when journal still balances", async () => {
    /* seed; raw INSERT with negative bomy_commission_sen but correct journal balance;
       should NOT throw */
  })

  test("5: order_items rejects line_total ≠ quantity * unit_price", async () => {
    /* seed orders row; raw INSERT order_items with mismatched line_total_sen;
       expect rejects with /order_items_line_total_chk/ */
  })

  // ── tests 6–8: RLS SELECT ────────────────────────────────────────────────────

  test("6: buyer SELECTs own orders; cannot SELECT another buyer's", async () => {
    /* seed 2 buyers, 2 orders; withTenant buyer1 sees own; cannot see buyer2's */
  })

  test("7: seller_owner SELECTs orders for own store; cannot SELECT another store's", async () => {
    /* seed seller, 2 stores, 2 orders; withTenant seller_owner sees own store's; cannot see other */
  })

  test("8: staff (bomy_admin/bomy_ops/bomy_finance) SELECT all orders", async () => {
    /* for each staff role, withTenant sees all seeded orders */
  })

  // ── tests 9–10c: RLS writes + edge cases ────────────────────────────────────

  test("9: NO role can INSERT/UPDATE/DELETE on orders/order_items/order_payouts/processed_webhook_events under withTenant", async () => {
    /* for each combination of role × table × operation, expect withTenant to throw
       (insufficient_privilege or policy violation) */
  })

  test("10: processed_webhook_events not readable under any withTenant context; only withAdmin", async () => {
    /* withTenant(db, any role) SELECT processed_webhook_events → 0 rows;
       withAdmin SELECT → seeded row visible */
  })

  test("10a: default-deny restrictive: unset current_user_id + unset bypass_rls → SELECT returns 0", async () => {
    /* raw db.select without withTenant/withAdmin; expect 0 rows on each table
       (regression for USING(false) bug caught in Bob R1 R0) */
  })

  test("10b: order_payouts role-predicate guard (Bob B2 regression)", async () => {
    /* seed user U who owns store S; seed order_payouts for S;
       withTenant(U, 'buyer') SELECT order_payouts → 0 rows;
       withTenant(U, 'seller_owner') SELECT order_payouts → sees payout row */
  })

  test("10c: orders + order_items role-predicate guard (Bob B2 regression)", async () => {
    /* seed store owner U, buyer B; seed order by B against U's store;
       withTenant(U, 'buyer') SELECT orders/order_items → 0 rows;
       withTenant(U, 'seller_owner') SELECT → sees rows */
  })
})
```

- [ ] **Step 2: Flesh out each test body**

Mirror the seeding pattern from `packages/db/tests/cart_checkout.test.ts`:

- `db.seed.user()` for buyers/sellers
- `withAdmin(db.raw, { userId: SYSTEM_ACTOR, reason: "test" }, ...)` for inserts via the admin path
- `db.raw.execute(sql`INSERT ...`)` for raw SQL that exercises CHECKs
- For RLS tests: use the `withTenant` wrapper per the checkout test pattern

- [ ] **Step 3: Run tests**

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/db test order_webhook.test.ts --run
```

Expected: 13 tests pass (tests 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10a, 10b, 10c).

- [ ] **Step 4: Commit**

```bash
git add packages/db/tests/order_webhook.test.ts
git commit -m "test(db): schema + RLS integration tests for orders, order_items, order_payouts, processed_webhook_events (tests 1–10c)"
```

---

## Task 6: commission.ts — pure functions + unit tests

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Create: `apps/api/src/webhooks/hitpay/commission.ts`

These are pure bigint functions with no I/O. Unit tests can be in a sibling file `apps/api/tests/webhooks/commission.test.ts` (not numbered in the spec §7 matrix but required by Task 6).

- [ ] **Step 1: Create the directory and commission.ts**

```bash
mkdir -p apps/api/src/webhooks/hitpay
```

```ts
// apps/api/src/webhooks/hitpay/commission.ts

export interface StorePspInput {
  storeId: string
  net: bigint // discounted_subtotal + shipping - voucher_contribution
}

export interface StoreSplitInput {
  discountedSubtotalSen: bigint
  shippingFeeSen: bigint
  voucherContributionSen: bigint
  pspFeeAllocatedSen: bigint
  commissionPct: number
}

export interface StoreSplitResult {
  sellerPayoutSen: bigint
  bomyCommissionSen: bigint
  catalogPspFee: bigint
  shippingPspFee: bigint
}

// Allocates pspFeeSen proportionally across stores by their net amount.
// Stores must be sorted ascending by storeId (deterministic; last store absorbs remainder).
export function allocatePspFee(
  stores: StorePspInput[],
  pspFeeSen: bigint,
  totalBuyerPaysSen: bigint,
): Array<{ storeId: string; pspFeeAllocatedSen: bigint }> {
  if (stores.length === 0) return []
  const result: Array<{ storeId: string; pspFeeAllocatedSen: bigint }> = []
  let remaining = pspFeeSen
  for (let i = 0; i < stores.length - 1; i++) {
    // BigInt division = floor
    const allocated =
      totalBuyerPaysSen === 0n ? 0n : (pspFeeSen * stores[i].net) / totalBuyerPaysSen
    result.push({ storeId: stores[i].storeId, pspFeeAllocatedSen: allocated })
    remaining -= allocated
  }
  result.push({ storeId: stores[stores.length - 1].storeId, pspFeeAllocatedSen: remaining })
  return result
}

// Computes per-store commission split. Commission = net_catalog × pct / 100.
// All division is bigint floor. bomyCommissionSen can be negative.
export function computeStoreSplit(input: StoreSplitInput): StoreSplitResult {
  const {
    discountedSubtotalSen,
    shippingFeeSen,
    voucherContributionSen,
    pspFeeAllocatedSen,
    commissionPct,
  } = input
  const denominator = discountedSubtotalSen + shippingFeeSen
  const catalogPspFee =
    denominator === 0n ? 0n : (pspFeeAllocatedSen * discountedSubtotalSen) / denominator
  const shippingPspFee = pspFeeAllocatedSen - catalogPspFee
  const netCatalog = discountedSubtotalSen - catalogPspFee
  const sellerShare = (netCatalog * BigInt(100 - commissionPct)) / 100n
  const sellerPayoutSen = sellerShare + shippingFeeSen - shippingPspFee
  const bomyCommissionSen = netCatalog - sellerShare - voucherContributionSen
  return { sellerPayoutSen, bomyCommissionSen, catalogPspFee, shippingPspFee }
}

// Asserts the journal balance invariant: lhs must equal rhs.
// Throws synchronously; call before INSERT so Postgres CHECK is never the first to catch.
export function assertJournalBalance(
  sellerPayoutSen: bigint,
  bomyCommissionSen: bigint,
  pspFeeAllocatedSen: bigint,
  discountedSubtotalSen: bigint,
  shippingFeeSen: bigint,
  voucherContributionSen: bigint,
): void {
  const lhs = sellerPayoutSen + bomyCommissionSen + pspFeeAllocatedSen
  const rhs = discountedSubtotalSen + shippingFeeSen - voucherContributionSen
  if (lhs !== rhs) {
    throw new Error(`assertJournalBalance: ${lhs} !== ${rhs} (diff=${lhs - rhs})`)
  }
}
```

- [ ] **Step 2: Write commission unit tests**

Create `apps/api/tests/webhooks/commission.test.ts`. Cover:

- `allocatePspFee` single store: allocated = pspFeeSen
- `allocatePspFee` multi-store: sum of allocated = pspFeeSen (last absorbs remainder)
- `allocatePspFee` zero pspFee: all allocations are 0
- `computeStoreSplit` commission_pct = 25, non-zero shipping and voucher
- `computeStoreSplit` commission_pct = 100: `sellerShare = 0`, `sellerPayoutSen` = shipping − shipping_psp_fee
- `computeStoreSplit` negative `bomyCommissionSen` (voucher > BOMY share): returns without error
- `assertJournalBalance` passes on balanced inputs
- `assertJournalBalance` throws on imbalanced inputs

```bash
pnpm --filter @bomy/api test commission.test.ts --run
```

Expected: all commission unit tests pass.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/api typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/webhooks/hitpay/commission.ts apps/api/tests/webhooks/commission.test.ts
git commit -m "feat(api): commission.ts — allocatePspFee, computeStoreSplit, assertJournalBalance pure functions + unit tests"
```

---

## Task 7: idempotency.ts — deriveEventIdentity, claimEvent

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Create: `apps/api/src/webhooks/hitpay/idempotency.ts`

Implement per spec §3.2. Key invariants: B11 (`claimEvent` returns `ClaimResult`, caller must compare hash + type on conflict and log `webhook_event_id_collision` at error).

- [ ] **Step 1: Create idempotency.ts**

Copy the spec §3.2 code exactly into `apps/api/src/webhooks/hitpay/idempotency.ts`. The module exports:

- `EventIdentity` interface
- `ClaimResult` type union (`{ owned: true }` | `{ owned: false; existing: { payloadHash: string; eventType: string } }`)
- `deriveEventIdentity(rawBody, headers): EventIdentity` — SHA-256 fallback when `Hitpay-Event-Id` header absent
- `claimEvent(tx: Database, identity: EventIdentity): Promise<ClaimResult>` — INSERT + `onConflictDoNothing` + read-after-conflict

Exact code is in spec §3.2 lines 459–530. File path: `apps/api/src/webhooks/hitpay/idempotency.ts`.

Verify these details match the spec literally:

- `pspEventId` fallback: `derived:${payloadHash}` prefix
- `claimEvent`: `onConflictDoNothing({ target: [pspProvider, pspEventId] })` — not a blanket conflict ignore
- On conflict: SELECT the existing row to return `{ owned: false, existing }` for caller collision detection (B11)
- If the post-conflict SELECT returns no row (impossible race): `throw new Error(...)` — this is the only throw inside `claimEvent`

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @bomy/api typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/webhooks/hitpay/idempotency.ts
git commit -m "feat(api): idempotency.ts — deriveEventIdentity, claimEvent, ClaimResult (event-id collision detection)"
```

---

## Task 8: order-fanout.ts — handleOrderPayment + fanOutPaid

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Create: `apps/api/src/webhooks/hitpay/order-fanout.ts`

This is the most critical file. All Bob correctness invariants B4–B11 surface here.

- [ ] **Step 1: Create order-fanout.ts with helper definitions**

File preamble and types (per spec §3.4):

```ts
// apps/api/src/webhooks/hitpay/order-fanout.ts
import { and, asc, eq, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

import { makeDb, schema, withAdmin } from "@bomy/db"
import type { Database } from "@bomy/db"

import { allocatePspFee, assertJournalBalance, computeStoreSplit } from "./commission.js"
import { claimEvent, type EventIdentity } from "./idempotency.js"
import { runConsistencyCheck, warnOnEventCollision } from "./park-review.js"
import { runFailureRelease } from "./failure-release.js"
import { parkPaymentReview } from "./park-review.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

export interface OrderPaymentArgs {
  app: FastifyInstance
  paymentRequestId: string
  paymentId: string
  status: string
  amountStr: string
  feesStr: string
  eventIdentity: EventIdentity
}
```

- [ ] **Step 2: Implement `selectSessionForUpdate`**

```ts
async function selectSessionForUpdate(tx: Database, paymentRequestId: string) {
  const rows = await tx
    .select()
    .from(schema.checkoutSessions)
    .where(eq(schema.checkoutSessions.pspPaymentRequestId, paymentRequestId))
    .for("update")
    .limit(1)
  return rows[0] ?? null
}
```

- [ ] **Step 3: Implement `handleOrderPayment` — steps A–G exactly as spec §3.4**

Copy the `handleOrderPayment` function body from spec §3.4 lines 588–688. Verify these invariants are present:

- **Step A** — `claimEvent(tx, args.eventIdentity)`. On `{ owned: false }`: `warnOnEventCollision(args, claim.existing)` then `runConsistencyCheck(tx, session, args)` then `return`. (B11)
- **Step B** — `selectSessionForUpdate(tx, args.paymentRequestId)`. Missing session → `log.error` + `return`.
- **Step C** — `if (!claim.owned)` → consistency check + return. (Uses session from step B.)
- **Step D (B5)** — `if (args.status === "failed")` → `runFailureRelease(tx, session, args)` + `return`. This fires BEFORE any amount or paymentId validation.
- **Step E** — unknown (non-completed, non-failed) status → `log.error` + `parkPaymentReview(tx, session, "amount_mismatch", args)` + `return`.
- **paymentId guard (B8)** — `if (!args.paymentId)` → `log.error` + `parkPaymentReview("amount_mismatch")` + `return`. (After step D, before amount parse.)
- **Amount parse** — `parseSen(args.amountStr)`. On catch: `log.error` + `parkPaymentReview("amount_mismatch")` + `return`.
- **Amount match** — `if (amountSen !== session.totalBuyerPaysSen)` → `parkPaymentReview("amount_mismatch")` + `return`.
- **Step F (B6)** — `if (session.status !== "pending_payment")` → `log.info` + `runConsistencyCheck` + `return`. (Second barrier — even a fresh event id short-circuits if session is not pending.)
- **Step G** — `fanOutPaid(tx, session, args)`.

- [ ] **Step 4: Implement `fanOutPaid` — 12 steps per spec §3.6**

Implement the 12 numbered steps. Key steps to verify explicitly:

**Step 1** — Lock reservations: `SELECT * FROM inventory_reservations WHERE checkout_session_id = $sessionId AND status = 'active' FOR UPDATE`.

**Step 2 (B4)** — Parse `feesStr` with `parseSen`. On fail: `parkPaymentReview("amount_mismatch")` + `return`. On `pspFeeSen > session.totalBuyerPaysSen`: same. UPDATE `checkout_sessions.psp_fee_sen = pspFeeSen`. Re-read in-memory value from the just-set local var (do not use the pre-update `session.psp_fee_sen`).

```ts
const pspFeeSen = parseSen(args.feesStr) // throws if unparseable → caller catches + parks
// ... validation ...
await tx
  .update(schema.checkoutSessions)
  .set({
    pspFeeSen,
    updatedAt: sql`now()`,
  })
  .where(eq(schema.checkoutSessions.id, session.id))
```

**Step 3** — Read `regular_order_commission_pct` from `platform_config`. Validate: exists, parses to integer, 0 ≤ value ≤ 100. On any failure → `parkPaymentReview("invalid_commission_config")`.

**Step 4** — Read all `checkout_session_stores` for session, sorted ascending by `store_id`. Read `checkout_session_items` grouped by `store_id`.

**Step 5** — `allocatePspFee(storesWithNet, pspFeeSen, session.totalBuyerPaysSen)`. Stores must be in ascending `store_id` order.

**Step 6** — Per store: `computeStoreSplit(...)` then `assertJournalBalance(...)`. Log `event: bomy_commission_negative` at warn if `split.bomyCommissionSen < 0n` (B10):

```ts
if (split.bomyCommissionSen < 0n) {
  args.app.log.warn(
    {
      event: "bomy_commission_negative",
      sessionId: session.id,
      storeId: csStore.storeId,
      bomyCommissionSen: split.bomyCommissionSen.toString(),
    },
    "hitpay webhook: bomy commission negative (voucher exceeds BOMY share)",
  )
}
```

**Step 7 (B7)** — INSERT orders using `ON CONFLICT (checkout_session_id, store_id) DO NOTHING RETURNING id`. If 0 rows returned for any store:

```ts
const inserted = await tx
  .insert(schema.orders)
  .values({ ... })
  .onConflictDoNothing()
  .returning({ id: schema.orders.id })

if (inserted.length === 0) {
  args.app.log.error(
    { event: "webhook_duplicate_fanout_blocked", sessionId: session.id, storeId: csStore.storeId, eventId: args.eventIdentity.pspEventId },
    "hitpay webhook: duplicate fan-out blocked by DB unique index — committing for audit row",
  )
  return // commit the transaction (audit row must persist; do NOT throw)
}
```

Do NOT throw on 0 rows — throwing would roll back the `admin_bypass_audit` row (B7).

**Step 8 (B10)** — Ledger entries. One credit for the full session gross. Per order: seller_payout debit gated on `> 0n`; processing_fee debit gated on `> 0n`:

```ts
// Credit: full session gross
await tx.insert(schema.ledgerEntries).values({
  transactionId: session.id,
  idempotencyKey: `checkout:${session.id}:credit`,
  direction: "credit",
  account: "revenue:regular_order",
  amountMinor: session.totalBuyerPaysSen,
  currency: "MYR",
  revenueSource: "regular_order",
  referenceId: session.id,
  referenceType: "checkout_session",
})
// Per-order debits (both gated on > 0n per ledger amount_minor > 0 CHECK)
for (const order of insertedOrders) {
  if (order.sellerPayoutSen > 0n) {
    await tx.insert(schema.ledgerEntries).values({
      transactionId: session.id,
      idempotencyKey: `order:${order.id}:seller_payout`,
      direction: "debit",
      account: "payable:seller_payout",
      amountMinor: order.sellerPayoutSen,
      currency: "MYR",
      revenueSource: "regular_order",
      referenceId: order.id,
      referenceType: "order",
    })
  }
  if (order.pspFeeAllocatedSen > 0n) {
    await tx.insert(schema.ledgerEntries).values({
      transactionId: session.id,
      idempotencyKey: `order:${order.id}:processing_fee`,
      direction: "debit",
      account: "expense:processing_fee",
      amountMinor: order.pspFeeAllocatedSen,
      currency: "MYR",
      revenueSource: "processing_fee",
      referenceId: order.id,
      referenceType: "order",
    })
  }
}
```

**Step 9** — Voucher claim (if `session.voucherId`). UPDATE vouchers; if 0 rows returned → set session `payment_review_required` with reason `voucher_claim_failed`; log error; skip step 10; do NOT skip step 11.

**Step 10** — UPDATE checkout_sessions `status = 'paid'` only when not already in review state. WHERE includes `AND status = 'pending_payment'`.

**Step 11** — UPDATE inventory_reservations `status = 'converted'` WHERE `checkout_session_id = $sessionId AND status = 'active'`.

**Step 12** — Log `event: order_payment_paid` at info (per §6.1 observability table).

- [ ] **Step 5: Add lock-order comment block (spec §3.3)**

Near the top of `fanOutPaid`, add a brief comment:

```ts
// Lock order: checkout_sessions → inventory_reservations → product_variants → vouchers.
// Matches PR #31 expiry job (FOR UPDATE OF cs, r SKIP LOCKED) and compensateInitiation.
// See spec §3.3 and pr31-cart-checkout-design.md §5.1. Do not deviate.
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @bomy/api typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/webhooks/hitpay/order-fanout.ts
git commit -m "feat(api): order-fanout.ts — handleOrderPayment (steps A–G), fanOutPaid (12 steps), lock-order comment"
```

---

## Task 9: failure-release.ts — runFailureRelease

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Create: `apps/api/src/webhooks/hitpay/failure-release.ts`

Implement per spec §3.7. Key invariant: B9 — conditional `psp_payment_id` set (Drizzle spread) prevents empty-string collision on partial unique index.

- [ ] **Step 1: Create failure-release.ts**

6 steps per spec §3.7:

```ts
// apps/api/src/webhooks/hitpay/failure-release.ts
import { and, eq, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

import { schema } from "@bomy/db"
import type { Database } from "@bomy/db"

import type { OrderPaymentArgs } from "./order-fanout.js"

type Session = Awaited<ReturnType<typeof import("./order-fanout.js").selectSessionForUpdate>>

export async function runFailureRelease(
  tx: Database,
  session: NonNullable<Session>,
  args: Pick<OrderPaymentArgs, "app" | "paymentId" | "eventIdentity">,
): Promise<void> {
  // Step 1: no-op if session already terminal
  if (session.status !== "pending_payment") {
    args.app.log.info(
      { sessionId: session.id, status: session.status, eventId: args.eventIdentity.pspEventId },
      "hitpay webhook: failed event arrived after session already terminal — skipping release",
    )
    return
  }

  // Step 2: release reservations
  const released = await tx
    .update(schema.inventoryReservations)
    .set({ status: "released", updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.inventoryReservations.checkoutSessionId, session.id),
        eq(schema.inventoryReservations.status, "active"),
      ),
    )
    .returning({
      variantId: schema.inventoryReservations.variantId,
      quantity: schema.inventoryReservations.quantity,
    })

  // Step 3: restore stock per released reservation
  for (const r of released) {
    await tx
      .update(schema.productVariants)
      .set({ stockCount: sql`stock_count + ${r.quantity}`, updatedAt: sql`now()` })
      .where(eq(schema.productVariants.id, r.variantId))
  }

  // Step 4: release voucher (if any)
  if (session.voucherId) {
    await tx
      .update(schema.vouchers)
      .set({ reservedCheckoutSessionId: null, reservedAt: null })
      .where(
        and(
          eq(schema.vouchers.id, session.voucherId),
          eq(schema.vouchers.reservedCheckoutSessionId, session.id),
          // redeemed_at IS NULL handled by SQL null check
          sql`${schema.vouchers.redeemedAt} IS NULL`,
        ),
      )
  }

  // Step 5 (B9): mark session failed. Conditional psp_payment_id set.
  // An empty paymentId must NOT be written — the partial unique index
  // (WHERE psp_payment_id IS NOT NULL) would treat "" as a real value
  // and collide on concurrent failed events with missing paymentId.
  await tx
    .update(schema.checkoutSessions)
    .set({
      status: "failed",
      ...(args.paymentId ? { pspPaymentId: args.paymentId } : {}),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.checkoutSessions.id, session.id),
        eq(schema.checkoutSessions.status, "pending_payment"),
      ),
    )

  // Step 6: log
  args.app.log.info(
    {
      event: "order_payment_failed",
      sessionId: session.id,
      paymentId: args.paymentId || null,
      eventId: args.eventIdentity.pspEventId,
      reservationsReleased: released.length,
      voucherReleased: Boolean(session.voucherId),
    },
    "hitpay webhook: order payment failed — reservations released",
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @bomy/api typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/webhooks/hitpay/failure-release.ts
git commit -m "feat(api): failure-release.ts — runFailureRelease (6-step release: reservations → stock → voucher → session failed, conditional psp_payment_id)"
```

---

## Task 10: park-review.ts — parkPaymentReview + runConsistencyCheck + warnOnEventCollision

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Create: `apps/api/src/webhooks/hitpay/park-review.ts`

- [ ] **Step 1: Create park-review.ts**

Three exports (per spec §3.5, §3.8, and §3.2 mismatch detection):

```ts
// apps/api/src/webhooks/hitpay/park-review.ts
import { and, count, eq, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

import { schema } from "@bomy/db"
import type { Database } from "@bomy/db"

import type { OrderPaymentArgs } from "./order-fanout.js"
import type { EventIdentity } from "./idempotency.js"

type Session = NonNullable<{
  id: string
  status: string
  paymentReviewReason: string | null
  userId: string
  voucherId: string | null
}>

// Emit webhook_event_id_collision error log when duplicate event id carries different content.
// Returns without throwing — 2xx contract must hold.
export function warnOnEventCollision(
  args: Pick<OrderPaymentArgs, "app" | "eventIdentity">,
  existing: { payloadHash: string; eventType: string },
): void {
  const { eventIdentity } = args
  if (
    existing.payloadHash !== eventIdentity.payloadHash ||
    existing.eventType !== eventIdentity.eventType
  ) {
    args.app.log.error(
      {
        event: "webhook_event_id_collision",
        pspEventId: eventIdentity.pspEventId,
        existingHash: existing.payloadHash,
        newHash: eventIdentity.payloadHash,
        existingType: existing.eventType,
        newType: eventIdentity.eventType,
      },
      "hitpay webhook: duplicate event_id with different payload — possible replay or HitPay bug",
    )
  }
}

// Read-only consistency check run on idempotency hits (spec §3.5).
// Emits consistency_check_failed at error on mismatches; never throws.
export async function runConsistencyCheck(
  tx: Database,
  session: Session,
  args: Pick<OrderPaymentArgs, "app" | "eventIdentity">,
): Promise<void> {
  try {
    // Verify the session/orders/ledger are in the expected steady state
    // per the table in spec §3.5. Implementation mirrors the status profiles:
    // 'paid': orders exist, reservations converted, ledger credit present
    // 'failed': no orders, reservations released/expired, no ledger credit
    // 'payment_review_required': no orders (unless voucher_claim_failed), no ledger (unless voucher_claim_failed)
    // Implement each case with SELECT COUNT / EXISTS queries against locked rows.
    // Mismatches → log.error({ event: "consistency_check_failed", ... }); return 200.
    args.app.log.info(
      {
        event: "order_payment_idempotent",
        sessionId: session.id,
        eventId: args.eventIdentity.pspEventId,
        previousStatus: session.status,
        consistencyCheck: "pass",
      },
      "hitpay webhook: idempotency hit — consistency OK",
    )
  } catch (err) {
    args.app.log.error(
      {
        event: "consistency_check_failed",
        sessionId: session.id,
        eventId: args.eventIdentity.pspEventId,
        err,
      },
      "hitpay webhook: consistency check error",
    )
  }
}

// Sets session to payment_review_required. Guard on pending_payment status.
// Caller is responsible for emitting the ops-critical log before calling this.
export async function parkPaymentReview(
  tx: Database,
  session: Session,
  reason: "amount_mismatch" | "invalid_commission_config" | "voucher_claim_failed",
  args: Pick<OrderPaymentArgs, "paymentId">,
): Promise<void> {
  await tx
    .update(schema.checkoutSessions)
    .set({
      status: "payment_review_required",
      paymentReviewReason: reason,
      ...(args.paymentId ? { pspPaymentId: args.paymentId } : {}),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.checkoutSessions.id, session.id),
        eq(schema.checkoutSessions.status, "pending_payment"),
      ),
    )
}
```

- [ ] **Step 2: Flesh out `runConsistencyCheck`**

Per spec §3.5, implement each status profile check:

- `paid`: assert `COUNT(orders WHERE checkout_session_id = session.id)` = number of stores; assert ledger credit exists with `idempotency_key = checkout:${session.id}:credit`; assert all reservations `status = 'converted'`.
- `failed`: assert no orders; assert no ledger credit; assert reservations `status IN ('released', 'expired')`.
- `payment_review_required` reason=`voucher_claim_failed`: assert orders exist; assert ledger credit exists; assert voucher `redeemed_checkout_session_id IS NULL`.
- `payment_review_required` other reasons: assert no orders; assert no ledger credit.
- Any other status: `log.error({ event: "consistency_check_failed", mismatchType: "unexpected_status" })`.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/api typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/webhooks/hitpay/park-review.ts
git commit -m "feat(api): park-review.ts — parkPaymentReview, runConsistencyCheck, warnOnEventCollision (§3.5, §3.8, §3.2 mismatch detection)"
```

---

## Task 11: Route plugin extension — dispatcher branch + routing/identity tests

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Modify: `apps/api/src/routes/webhooks/hitpay.ts` (add order-payment dispatcher branch)
- Modify: `apps/api/tests/webhooks/hitpay.test.ts` (add tests 11–13, 36–38)

- [ ] **Step 1: Add order-payment dispatcher branch to the route plugin**

Open `apps/api/src/routes/webhooks/hitpay.ts`. Locate the `if (eventType === 'charge.updated')` dispatcher block.

Insert a new branch as the **first** branch (before `charge.updated`), per spec §3.1:

```ts
// New branch: order payment events. Must fire BEFORE the brand-sub branch because
// checkout_sessions and brand_subscriptions share the payment_request_id namespace.
if (
  (eventType === "payment_request.completed" || eventType === "payment_request.failed") &&
  !recurringBillingId // recurring events always go to brand-sub branch
) {
  // One cheap indexed lookup to decide dispatcher (no lock; lock happens inside handleOrderPayment).
  const checkoutSession = await withPublicRead(getDb(), (db) =>
    db
      .select({ id: schema.checkoutSessions.id })
      .from(schema.checkoutSessions)
      .where(eq(schema.checkoutSessions.pspPaymentRequestId, paymentRequestId))
      .limit(1),
  )

  if (checkoutSession.length > 0) {
    const identity = deriveEventIdentity(
      rawBody,
      request.headers as Record<string, string | undefined>,
    )
    await handleOrderPayment({
      app: fastify,
      paymentRequestId,
      paymentId: body.payment_id ?? "",
      status: body.status ?? "",
      amountStr: body.amount ?? "0.00",
      feesStr: body.fees ?? "0.00",
      eventIdentity: identity,
    })
    return reply.send({ received: true })
  }
  // Fall through to brand-sub branch below.
}
```

Add the necessary imports at the top:

```ts
import { deriveEventIdentity } from "../../webhooks/hitpay/idempotency.js"
import { handleOrderPayment } from "../../webhooks/hitpay/order-fanout.js"
```

- [ ] **Step 2: Add OTel attributes (spec §6.2)**

Inside the existing OTel span block in the webhook handler, after the order-payment branch fires, add:

```ts
span.setAttribute("bomy.checkout_session_id", session.id) // set inside handleOrderPayment if span is accessible
span.setAttribute("bomy.psp_event_id", identity.pspEventId)
```

If the span is not easily accessible from inside `handleOrderPayment`, set it in the route plugin after the handler returns.

- [ ] **Step 3: Add routing + identity tests to `apps/api/tests/webhooks/hitpay.test.ts`**

Tests 11–13 and 36–38 from spec §7.3 and §7.2 routing section:

- **Test 11** — `payment_request_id` matches `checkout_sessions` → order handler fires, NOT brand-sub.
- **Test 12** — `payment_request_id` matches `brand_subscriptions` only → existing brand-sub handler fires (unchanged).
- **Test 13** — Missing `Hitpay-Event-Id` header → derived `psp_event_id` via `derived:SHA256(body)` prefix; warns in log; still idempotent on repeated body.
- **Test 36** — Order event does NOT invoke brand-subscription handler (regression for §3.1 dispatcher order).
- **Test 37** — `Hitpay-Event-Type: charge.updated` with a checkout_session `payment_id` → goes to refund handler; logs warning (not crash).
- **Test 38** — Signature failure on order event → 401; no idempotency row written; no session mutation.

- [ ] **Step 4: Run routing tests**

```bash
pnpm --filter @bomy/api test hitpay.test.ts --run
```

Expected: all existing brand-sub/membership tests still pass; 6 new tests (11–13, 36–38) pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @bomy/api typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/webhooks/hitpay.ts apps/api/tests/webhooks/hitpay.test.ts
git commit -m "feat(api): webhook dispatcher — order-payment branch (before brand-sub), OTel attributes, routing tests 11–13, 36–38"
```

---

## Task 12: Full handler integration tests

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

**Files:**

- Create: `apps/api/tests/webhooks/hitpay-order.test.ts`

All 43 handler tests (tests 14–35 from spec §7.2, plus sub-tests). Sign each test body with the real HMAC key so the signature gate is exercised end-to-end.

- [ ] **Step 1: Create test file scaffold**

Mirror the existing `hitpay.test.ts` for:

- Fastify app setup with the webhook plugin loaded
- HMAC signing helper (use the real HitPay client verify logic)
- Real Postgres (`DATABASE_APP_URL`)

```ts
// apps/api/tests/webhooks/hitpay-order.test.ts
// Real Postgres, real HMAC signing, no HitPay outbound calls.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { buildApp } from "../../src/app.js"
import { setupTestDb } from "../helpers/setup.js"

// ... setup ...
```

- [ ] **Step 2: Implement tests 14–16d (idempotency)**

- **14** — Two identical `payment_request.completed` with same `Hitpay-Event-Id` → second is no-op; ledger credit count = 1; orders count = 1 per store.
- **15** — Second delivery runs consistency check; passes; no error log.
- **16** — Second delivery on `voucher_claim_failed` session: orders + ledger present; voucher unclaimed; consistency OK.
- **16a** — Duplicate event id with different `payload_hash` → `webhook_event_id_collision` at error; no side effects.
- **16b** — Duplicate event id, same hash but different `event_type` → same collision log.
- **16c** — Two different event ids for same payment_request_id, both `completed` → first fans out; second sees `status = 'paid'`, short-circuits at step F; exactly one set of orders + ledger.
- **16d** — Force second event past status guard (fixture sets session back to `pending_payment` mid-test) → `ON CONFLICT DO NOTHING` returns 0 rows; `webhook_duplicate_fanout_blocked` emitted at error; original orders unchanged; second `admin_bypass_audit` row persists (tx committed, not thrown).

- [ ] **Step 3: Implement tests 17–21 (paid happy path)**

- **17** — Single-store, no voucher, no brand discount → order row; ledger 1 credit + 1 seller_payout debit + 1 processing_fee debit; reservations `converted`; session `paid`.
- **18** — 3-store cart → 3 orders ascending store_id; `SUM(psp_fee_allocated_sen) = session.psp_fee_sen`; journal balance CHECK on every row.
- **19** — Voucher present → `vouchers.redeemed_checkout_session_id` set; `reserved_checkout_session_id = NULL`; `redeemed_at` set.
- **20** — Brand discount active → `orders.brand_discount_sen` preserved; commission on `discounted_subtotal_sen`.
- **21** — Voucher only on one of two stores → both orders sum to session totals.

- [ ] **Step 4: Implement tests 22–26 (review-state guards)**

- **22** — Webhook amount ≠ `total_buyer_pays_sen` → `payment_review_required`, reason `amount_mismatch`; no orders; no ledger; reservations untouched; `psp_payment_id` not set.
- **22a** — `feesStr = "abc"` on completed → review state; ops log mentions PSP-fee parse failure. (B4)
- **22b** — `feesStr = "1000.00"` with `total_buyer_pays_sen = 5000` (fee > gross) → review state. (B4)
- **22c** — Completed with empty `payment_id` → `payment_review_required`; `psp_payment_id` not set; ops error log "payment_id missing". (B8)
- **23** — `regular_order_commission_pct` missing from platform_config → review state, reason `invalid_commission_config`.
- **24** — `regular_order_commission_pct = '125'::jsonb` → same as 23.
- **25** — `regular_order_commission_pct = '"twenty-five"'::jsonb` → same as 23.
- **26** — Voucher claim race (second connection NULLs `reserved_checkout_session_id` mid-tx) → orders + ledger commit; voucher unclaimed; session `payment_review_required` reason `voucher_claim_failed`; ops-critical log.

- [ ] **Step 5: Implement tests 27–29d (failed path)**

- **27** — `payment_request.failed` → reservations `released`; stock restored; voucher released; session `failed`; no orders; no ledger.
- **28** — `payment_request.failed` on already-expired session → no-op; no `log.error`.
- **29** — Failed arrives after completed (different `psp_event_id`) → claims fresh row; sees session `paid`; `runFailureRelease` short-circuits at step 1; session stays `paid`.
- **29a** — `payment_request.failed` with `amountStr = ""` → routes to `runFailureRelease` BEFORE amount parse; release proceeds. (B5)
- **29b** — `amountStr = "0.00"` on failed → release proceeds. (B5)
- **29c** — `amountStr = "abc"` on failed → routes to `runFailureRelease`; no `parseSen` throw escapes. (B5)
- **29d (B9)** — Two independent `pending_payment` sessions, both get `payment_request.failed` with empty `paymentId` → both end `failed`; both keep `psp_payment_id IS NULL`; each set of reservations released and stock restored; partial unique index NOT violated.

- [ ] **Step 6: Implement tests 30–31 (lock + race)**

- **30** — Two concurrent completed events with same `psp_event_id` → one wins conflict; exactly one set of orders + ledger. (Superseded by 16c per spec note; still test it.)
- **31** — Expiry job fires while webhook holds session `FOR UPDATE` → expiry job's SKIP LOCKED returns 0 candidates for this session; fan-out completes; final state = `paid`, reservations `converted`.

- [ ] **Step 7: Implement tests 31a–31d (PSP fee + commission edges)**

- **31a** — `feesStr = "0.95"` on `"50.00"` charge → `psp_fee_sen = 95n` on session; per-store `psp_fee_allocated_sen` sums to `95n`.
- **31b** — Single-store, `feesStr = "0.95"` → exactly one order with `psp_fee_allocated_sen = 95n`; one ledger debit `expense:processing_fee` for `95n`.
- **31c** — 3-store cart, `feesStr = "0.07"` → allocations floor; last store absorbs remainder; `SUM = 7n`.
- **31d** — `commission_pct = 100` + zero shipping → `seller_payout_sen = 0`; no `payable:seller_payout` ledger leg; journal balances. (B10)

- [ ] **Step 8: Implement tests 32–35 (edge cases)**

- **32** — `voucher_contribution > bomy_share` → negative `bomy_commission_sen`; order passes CHECK; `bomy_commission_negative` at warn.
- **33** — `psp_fee_sen = 0` → no `processing_fee` ledger leg; `psp_fee_allocated_sen = 0` on orders.
- **34** — Zero shipping (all stores) → `shipping_psp_fee = 0`; `seller_payout = seller_share` only.
- **35** — Seller buys from own store → orders + ledger process normally; no exclusion.

- [ ] **Step 9: Run full test file**

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/api test hitpay-order.test.ts --run
```

Expected: all 43 handler tests pass.

- [ ] **Step 10: Run full API test suite to confirm no regressions**

```bash
pnpm --filter @bomy/api test --run
```

Expected: all existing tests still pass.

- [ ] **Step 11: Commit**

```bash
git add apps/api/tests/webhooks/hitpay-order.test.ts apps/api/tests/webhooks/commission.test.ts
git commit -m "test(api): hitpay-order integration tests — tests 14–35 (idempotency, paid path, review guards, failed path, race, PSP fee/commission edges)"
```

---

## Task 13: Final smoke + branch hygiene

> **Model: Sonnet 4.6** (plan) / **Opus 4.7** (implementation)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: all packages green. (Node 24.14.1 pnpm engine warning is non-blocking; doc-only + API implementation, same as PR #31.)

- [ ] **Step 2: Typecheck all packages**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: `--max-warnings 0` passes.

- [ ] **Step 4: Verify checkout_enabled is still false**

```bash
psql $DATABASE_URL -c "SELECT value FROM platform_config WHERE key = 'checkout_enabled'"
```

Expected: `false`. **Do not flip.** The post-deploy runbook (spec §1.3) gates this on staging smoke + amount-mismatch test passing.

- [ ] **Step 5: Verify 3 new platform_config seeds exist**

```bash
psql $DATABASE_URL -c "SELECT key, value FROM platform_config WHERE key IN ('regular_order_commission_pct','order_auto_complete_days','order_auto_delivered_days')"
```

Expected: 3 rows with values `25`, `7`, `30`.

- [ ] **Step 6: Manual stack smoke (light — no real HitPay creds needed)**

```bash
docker compose -f infra/docker/compose.yml up -d
pnpm --filter @bomy/api dev
```

Hit `POST /webhooks/hitpay` with a malformed body (no valid HMAC). Confirm 401 response and no database mutation. The webhook handler must not crash the server.

- [ ] **Step 7: Update handoff and push**

Update `app/.andy/handoff.md` (do NOT commit it — Charlie's standing rule). Note PR #32 implementation complete, ready for Bob review.

```bash
git push -u origin feat/order-webhook-ledger
gh pr create \
  --title "feat(db,api): order webhook + ledger fan-out (PR #32)" \
  --body "Implements HitPay order-payment webhook fan-out: migration 0012, idempotency, per-store commission split, double-entry ledger, reservation conversion. Per spec docs/superpowers/specs/2026-05-17-pr32-order-webhook-ledger-design.md (Bob-approved dd670ae)."
```

- [ ] **Step 8: Write PR log**

Create `app/log/2026-05-17_PR32_order-webhook-ledger.md` per log cadence gate (mandatory before starting PR #33).

---

## Self-review

**Spec coverage — task-to-spec mapping:**

| Spec section                      | Plan task      |
| --------------------------------- | -------------- |
| §2.1 Enums                        | Tasks 1, 4     |
| §2.2 Tables + CHECKs              | Tasks 1, 4     |
| §2.4 Indexes                      | Task 1         |
| §2.5 RLS policies                 | Task 2         |
| §2.6 platform_config seeds        | Task 3         |
| §2.7 Drizzle modules              | Task 4         |
| §3.1 Dispatcher routing           | Task 11        |
| §3.2 claimEvent + CollisionResult | Task 7         |
| §3.3 Lock order comment           | Task 8         |
| §3.4 handleOrderPayment steps A–G | Task 8         |
| §3.5 Consistency check            | Task 10        |
| §3.6 fanOutPaid 12 steps          | Task 8         |
| §3.7 runFailureRelease 6 steps    | Task 9         |
| §3.8 parkPaymentReview            | Task 10        |
| §6.1 Observability log events     | Tasks 8, 9, 10 |
| §6.2 OTel attributes              | Task 11        |
| §7.1 Schema + RLS tests 1–10c     | Task 5         |
| §7.2 Handler tests 14–35          | Task 12        |
| §7.3 Routing tests 36–38          | Task 11        |
| §9 Task breakdown                 | All tasks 1–13 |

**Bob-flagged invariants — surfaced in plan steps:**

| Invariant                                                      | Plan step                         |
| -------------------------------------------------------------- | --------------------------------- |
| B1: RESTRICTIVE `IS NOT NULL OR is_admin_bypass()`             | Task 2 Step 1                     |
| B2: SELECT seller branches role-gated                          | Task 2 Step 1                     |
| B3: INSERT/UPDATE/DELETE requires `is_admin_bypass()`          | Task 2 Step 1                     |
| B4: PSP fee parse strict + persisted before split math         | Task 8 Step 4 (fanOutPaid step 2) |
| B5: Failed-path routing before amount validation               | Task 8 Step 3 (step D)            |
| B6: Session status guard second barrier                        | Task 8 Step 3 (step F)            |
| B7: `ON CONFLICT DO NOTHING`; 0 rows = log + commit, not throw | Task 8 Step 4 (fanOutPaid step 7) |
| B8: `paymentId` guard on completed events                      | Task 8 Step 3 (paymentId guard)   |
| B9: Conditional `psp_payment_id` spread on failed path         | Task 9 Step 1                     |
| B10: Ledger legs gated on `> 0n`                               | Task 8 Step 4 (fanOutPaid step 8) |
| B11: ClaimResult + collision detection + error log             | Task 7 Step 1                     |

**Test coverage — all 56 test IDs from spec §7:**

Schema/RLS (Task 5): 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10a, 10b, 10c

Routing/identity (Task 11): 11, 12, 13, 36, 37, 38

Handler integration (Task 12):

- Idempotency: 14, 15, 16, 16a, 16b, 16c, 16d
- Paid path: 17, 18, 19, 20, 21
- Review guards: 22, 22a, 22b, 22c, 23, 24, 25, 26
- Failed path: 27, 28, 29, 29a, 29b, 29c, 29d
- Lock + race: 30, 31
- PSP fee + commission: 31a, 31b, 31c, 31d
- Edge cases: 32, 33, 34, 35

Commission unit tests (Task 6): not numbered in spec §7 matrix; separate commission.test.ts.

---

## Placeholder scan

No "TBD" or "TODO" steps in this plan. Steps that require the implementer to flesh out test bodies (Tasks 5 Step 2 and 12 Steps 2–8) are explicitly framed with the spec test ID, the assertion shape, and which seeding helpers to mirror. Each test body is scaffolded — "flesh out" means add seed calls and assertions, not leave a blank. The lock-order comment in Task 8 Step 5 is a required code comment, not a planning placeholder.

---

## Execution Handoff

**Plan complete at `docs/superpowers/plans/2026-05-17-pr32-order-webhook-ledger.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh Opus 4.7 subagent per task, Bob review after each commit. RLS (Task 2), handler (Tasks 8–9), and tests (Task 12) are load-bearing and benefit from Opus 4.7's stronger reasoning.

**2. Inline Execution** — Execute tasks in a single Opus 4.7 session using executing-plans, checkpoint after each commit.

**Model assignments:**

- Tasks 1–4: Can run on Sonnet 4.6 (migration DDL + schema module authoring — mechanical translation from spec).
- Tasks 5–12: **Opus 4.7** (RLS correctness, lock-order semantics, commission math, idempotency edge cases, test matrix implementation).
- Task 13: Can run on Sonnet 4.6 (hygiene + push).

---

## After PR #32 merges

Per spec §1.3 post-deploy runbook (NOT a plan task — ops action):

1. Deploy `apps/api` + migration 0012 to staging.
2. Verify webhook endpoint reachable from HitPay sandbox.
3. Staging smoke: complete a real checkout; verify orders, ledger, reservations, session status.
4. Amount-mismatch test: confirm `payment_review_required` fires correctly.
5. Ops accepts `stores.flat_shipping_fee_sen` values.
6. Flip `platform_config.checkout_enabled = true` via ops DB script.

Until all 6 steps pass, `checkout_enabled` stays `false`.

**Next PR:** `feat/order-management` (PR #33) — buyer order history, seller order management, admin payouts page, `OrderAutoCompleteJob`.
