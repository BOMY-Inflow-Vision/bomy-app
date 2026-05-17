# PR #32 — Order Webhook + Ledger Fan-out Design

**Date:** 2026-05-17
**Author:** Andy (AI technical lead)
**Reviewer:** Bob (strategist developer)
**Status:** Draft R3 — Bob R3 revisions applied (conditional `psp_payment_id` set on failed-path mirrors membership handler; `orders` + `order_items` SELECT policies role-gated on the seller branch; `orders_session_store_unique` comment corrected)
**Builds on:** Stage 5 spec (`2026-05-13-stage5-products-orders-design.md`) §3.4, §4.3, §6.1, §12; PR #31 spec (`2026-05-15-pr31-cart-checkout-design.md`) §5
**Branch:** `feat/order-webhook-ledger` (design branch: `design/pr32-order-webhook-ledger`)
**Migration number:** `0012_order_webhook_ledger.sql`

---

## 1. Scope

PR #32 lands the server side of the payment fan-out: it accepts the HitPay webhook for an order payment, validates the payload, captures the PSP fee, computes per-store commission splits, creates `orders` + `order_items` rows, writes the double-entry ledger, claims the buyer's voucher, and transitions reservations `active → converted` and the session `pending_payment → paid` — all in one atomic `withAdmin` transaction per event.

It does **not** ship any new UI (buyer order history, seller order management, admin views) — those land in PR #33.

### 1.1 Ships in this PR

1. Migration `0012_order_webhook_ledger.sql` — `orders`, `order_items`, `order_payouts`, `processed_webhook_events` tables; three new enums (`order_payment_status`, `order_fulfilment_status`, `order_payout_status`); `platform_config` seed `regular_order_commission_pct = 25`; full RLS + CHECKs from Stage 5 spec §3.4 + §3.5; index set per §2.4 below.
2. Extension of `apps/api/src/routes/webhooks/hitpay.ts` — new order-payment routing branch that fires **before** the existing brand-subscription branch on the same `payment_request.completed` / `payment_request.failed` events.
3. Order-fan-out handler in `apps/api/src/webhooks/hitpay/order-fanout.ts` (new file extracted from the route plugin to keep the route file thin).
4. Helper modules:
   - `apps/api/src/webhooks/hitpay/commission.ts` — pure functions: `allocatePspFee`, `computeStoreSplit`, `assertJournalBalances`.
   - `apps/api/src/webhooks/hitpay/idempotency.ts` — `claimEvent`, consistency-check helpers.
5. Failure-path release helper in `apps/api/src/webhooks/hitpay/failure-release.ts` — invoked on `payment_request.failed` to undo PR #31's reservations and restore stock + release voucher + mark the session `failed`.
6. Integration tests under `apps/api/tests/webhooks/hitpay-order.test.ts` (~25 tests) and `packages/db/tests/order_webhook.test.ts` (~10 tests).

### 1.2 Out of scope (deferred)

- Buyer / seller / admin order management UIs — **PR #33** (`feat/order-management`).
- `OrderAutoCompleteJob` (delivered→completed sweep) — **PR #33**.
- Order detail server actions (`confirmDelivery`, `enterTracking`, `markDelivered`) — **PR #33**.
- Real email notifications wired to SendGrid/Postmark — **PR #34**.
- HitPay Transfers API integration for actual payouts — Stage 6+ (KYB-gated).
- Refund flow business logic — Stage 6+. Migration 0012 only ships the schema hooks (`refund_requested_at`, `refunded_at`, `refund_amount_sen` columns on `orders`).
- Admin commission-rate editing UI — deferred per Stage 5 spec §8.

### 1.3 Post-deploy runbook (gates `checkout_enabled = true`)

After PR #32 merges and deploys to staging, ops runs a smoke test, then flips `checkout_enabled = true` in production. Sequence — **do not skip any step**:

1. PR #32 merged to `main`; `apps/api` and migration 0012 deployed to staging.
2. Verify webhook endpoint reachable from HitPay sandbox (TLS + HMAC).
3. Smoke test on staging (a test buyer with a real `checkout_enabled = true` in staging DB):
   - Add a single product to cart, complete `/checkout` against HitPay sandbox.
   - Confirm webhook receives `payment_request.completed` and writes:
     - one `orders` row matching `checkout_session_stores`
     - matching `order_items`
     - ledger credit + per-order seller-payout debit + per-order processing-fee debit
     - voucher claim row (if a voucher was used)
     - `inventory_reservations.status = 'converted'`
     - `checkout_sessions.status = 'paid'`
   - Reconcile the ledger against the order roll-up (the ledger model is single-entry-style — credits and debits do **not** sum to equal in this PR; BOMY's retained commission is the implicit difference, consistent with Stage 4's brand-subscription pattern):
     ```sql
     SELECT direction, sum(amount_minor) AS total
       FROM ledger_entries
      WHERE transaction_id = $sessionId
      GROUP BY direction;
     ```
     Expected:
     - `direction='credit'` total = `checkout_sessions.total_buyer_pays_sen`
     - `direction='debit'` total = `sum(orders.seller_payout_sen) + sum(orders.psp_fee_allocated_sen)` for the session
     - `credit - debit` = `sum(orders.bomy_commission_sen)` — BOMY's retained commission for this checkout (can be negative when voucher exceeds BOMY share; see §3.6 step 8 and open question #1)
4. Repeat the smoke with a deliberately mismatched amount (manual DB edit on `checkout_sessions.total_buyer_pays_sen` before HitPay capture) — confirm session lands in `payment_review_required` with reason `amount_mismatch`, no orders, no ledger.
5. Ops accepts current `stores.flat_shipping_fee_sen` values per active store (`0` is acceptable until PR #33 seller UI).
6. Flip `platform_config.checkout_enabled = true` in production via ops DB script:
   ```sql
   UPDATE platform_config SET value = 'true'::jsonb, updated_at = now()
    WHERE key = 'checkout_enabled';
   ```
   Audit row in `platform_config_audit` confirmed.

Until steps 1–5 are green, `checkout_enabled` stays `false`. The webhook handler still ships and listens — sessions just never reach it because `/checkout` short-circuits with `CHECKOUT_DISABLED`.

---

## 2. Migration 0012 (`0012_order_webhook_ledger.sql`)

### 2.1 New enums

```sql
CREATE TYPE order_payment_status AS ENUM (
  'pending','paid','failed','refunded','partially_refunded'
);
CREATE TYPE order_fulfilment_status AS ENUM (
  'processing','shipped','delivered','completed','cancelled'
);
CREATE TYPE order_payout_status AS ENUM (
  'pending','processing','completed','failed'
);
```

- `order_payment_status.pending` is **never inserted in this PR** — the webhook fan-out always creates rows at `paid`. The enum value exists so the future refund / chargeback flow can transition rows without an enum alter.
- `order_fulfilment_status.processing` is the default at row insert; `shipped` / `delivered` / `completed` transitions ship in PR #33; `cancelled` is reserved for refund flow (Stage 6+).
- `order_payout_status.pending` is the default; transitions are admin-driven and ship in PR #33's `/payouts` page.

### 2.2 New tables

Full column lists per Stage 5 spec §3.4. Field-by-field detail follows.

#### `orders`

| Column                   | Type                                                     | Notes                                                                               |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| id                       | uuid PK defaultRandom                                    |                                                                                     |
| checkout_session_id      | uuid NOT NULL → checkout_sessions(id) ON DELETE RESTRICT |                                                                                     |
| store_id                 | uuid NOT NULL → stores(id) ON DELETE RESTRICT            |                                                                                     |
| buyer_id                 | uuid NOT NULL → users(id) ON DELETE RESTRICT             |                                                                                     |
| currency                 | currency_code NOT NULL default 'MYR'                     |                                                                                     |
| shipping_address         | jsonb NOT NULL                                           | Snapshot copied from `checkout_sessions.shipping_address` at insert                 |
| shipping_fee_sen         | bigint NOT NULL                                          | Snapshot copied from `checkout_session_stores.shipping_fee_sen`                     |
| retail_subtotal_sen      | bigint NOT NULL                                          | Snapshot copied from `checkout_session_stores.retail_subtotal_sen`                  |
| brand_discount_sen       | bigint NOT NULL default 0                                |                                                                                     |
| discounted_subtotal_sen  | bigint NOT NULL                                          | = `retail_subtotal_sen − brand_discount_sen`                                        |
| voucher_contribution_sen | bigint NOT NULL default 0                                | Reporting only — not a ledger leg                                                   |
| psp_fee_allocated_sen    | bigint NOT NULL default 0                                | Allocated proportionally from `checkout_sessions.psp_fee_sen`                       |
| bomy_commission_sen      | bigint NOT NULL                                          | Net after voucher; absorbs rounding remainder; can be negative                      |
| bomy_commission_pct      | integer NOT NULL                                         | Snapshot of `regular_order_commission_pct` at fan-out time                          |
| seller_payout_sen        | bigint NOT NULL                                          |                                                                                     |
| payment_status           | order_payment_status NOT NULL default 'pending'          | Webhook inserts as `'paid'`. The `'pending'` default is for the refund-flow future. |
| fulfilment_status        | order_fulfilment_status NOT NULL default 'processing'    |                                                                                     |
| carrier                  | text nullable                                            | Filled by seller in PR #33                                                          |
| tracking_number          | text nullable                                            | Filled by seller in PR #33                                                          |
| shipped_at               | timestamptz nullable                                     |                                                                                     |
| delivered_at             | timestamptz nullable                                     |                                                                                     |
| completed_at             | timestamptz nullable                                     |                                                                                     |
| refund_requested_at      | timestamptz nullable                                     | Schema hook only — Stage 6 flow                                                     |
| refunded_at              | timestamptz nullable                                     | Schema hook only                                                                    |
| refund_amount_sen        | bigint nullable                                          | Schema hook only — allows partial refunds when flow is built                        |
| created_at               | timestamptz NOT NULL defaultNow                          |                                                                                     |
| updated_at               | timestamptz NOT NULL defaultNow                          |                                                                                     |

CHECK constraints (from Stage 5 spec §3.5, mirrored in the Drizzle module):

```sql
-- Journal balance (the load-bearing one — protects ledger integrity).
CHECK (seller_payout_sen + bomy_commission_sen + psp_fee_allocated_sen
       = discounted_subtotal_sen + shipping_fee_sen - voucher_contribution_sen)
CHECK (discounted_subtotal_sen = retail_subtotal_sen - brand_discount_sen)
CHECK (bomy_commission_pct BETWEEN 0 AND 100)
CHECK (retail_subtotal_sen >= 0)
CHECK (shipping_fee_sen >= 0)
CHECK (brand_discount_sen >= 0)
CHECK (brand_discount_sen <= retail_subtotal_sen)
CHECK (discounted_subtotal_sen >= 0)
CHECK (voucher_contribution_sen >= 0)
```

Note: `bomy_commission_sen` is **not** range-constrained because it can legitimately go negative when a voucher contribution exceeds BOMY's share of the basket. The journal-balance CHECK is what guarantees correctness regardless of sign.

#### `order_items`

| Column           | Type                                                    | Notes                                                 |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| id               | uuid PK defaultRandom                                   |                                                       |
| order_id         | uuid NOT NULL → orders(id) ON DELETE CASCADE            |                                                       |
| store_id         | uuid NOT NULL → stores(id) ON DELETE RESTRICT           | Denormalised for per-store reporting                  |
| variant_id       | uuid nullable → product_variants(id) ON DELETE SET NULL | Nullable: survives variant deletion                   |
| currency         | currency_code NOT NULL default 'MYR'                    |                                                       |
| product_snapshot | jsonb NOT NULL                                          | Copied from `checkout_session_items.product_snapshot` |
| variant_snapshot | jsonb NOT NULL                                          | Copied from `checkout_session_items.variant_snapshot` |
| quantity         | integer NOT NULL                                        | CHECK > 0                                             |
| unit_price_sen   | bigint NOT NULL                                         |                                                       |
| line_total_sen   | bigint NOT NULL                                         | CHECK = `quantity * unit_price_sen`                   |
| created_at       | timestamptz NOT NULL defaultNow                         |                                                       |

#### `order_payouts`

| Column               | Type                                           | Notes                                          |
| -------------------- | ---------------------------------------------- | ---------------------------------------------- |
| id                   | uuid PK defaultRandom                          |                                                |
| order_id             | uuid NOT NULL → orders(id) ON DELETE RESTRICT  |                                                |
| amount_sen           | bigint NOT NULL                                | = `order.seller_payout_sen` at creation time   |
| currency             | currency_code NOT NULL default 'MYR'           |                                                |
| psp_provider         | psp_provider nullable                          | Future: when Transfers API is called           |
| psp_transfer_id      | text nullable                                  | Future: HitPay transfer ref                    |
| manual_ref           | text nullable                                  | Admin-entered external bank transfer reference |
| status               | order_payout_status NOT NULL default 'pending' |                                                |
| reconciliation_notes | text nullable                                  |                                                |
| triggered_by         | uuid NOT NULL → users(id) ON DELETE RESTRICT   | Admin who created the record                   |
| triggered_at         | timestamptz NOT NULL defaultNow                |                                                |
| completed_at         | timestamptz nullable                           |                                                |

`order_payouts` is created by migration 0012 but the **only writer** in this PR is the schema itself — PR #32 does not insert rows into it. Insertion happens in PR #33's admin `/payouts` page. Listed here so the table, RLS, and indexes ship in one migration.

#### `processed_webhook_events`

| Column       | Type                            | Notes                              |
| ------------ | ------------------------------- | ---------------------------------- |
| id           | uuid PK defaultRandom           |                                    |
| psp_provider | psp_provider NOT NULL           |                                    |
| psp_event_id | text NOT NULL                   | HitPay's webhook event id          |
| event_type   | text NOT NULL                   | e.g. `payment_request.completed`   |
| payload_hash | text NOT NULL                   | SHA-256 of raw signed request body |
| processed_at | timestamptz NOT NULL defaultNow |                                    |

UNIQUE on `(psp_provider, psp_event_id)`. The unique constraint **is** the idempotency gate.

**Important:** HitPay's webhook headers include `Hitpay-Event-Id`. We use that as `psp_event_id`. If HitPay ever omits this header, the handler falls back to a deterministic SHA-256 of the canonical event body (raw bytes verified against HMAC) so retries still collapse — see §3.2.

### 2.3 `ALTER TABLE` changes

None. PR #31's migration 0011 already added every column the order webhook reads from (`psp_payment_request_id`, `psp_payment_id`, `psp_fee_sen`, `payment_review_reason`, etc.).

### 2.4 Indexes (migration 0012)

```sql
-- orders
CREATE INDEX orders_checkout_session_idx ON orders (checkout_session_id);
CREATE INDEX orders_store_fulfilment_idx ON orders (store_id, fulfilment_status);
CREATE INDEX orders_buyer_payment_idx    ON orders (buyer_id, payment_status);

-- Belt-and-braces against duplicate fan-out: one order per (session, store).
-- The handler in §3.6 step 7 uses INSERT ... ON CONFLICT (checkout_session_id,
-- store_id) DO NOTHING RETURNING id and treats a 0-row return as a duplicate-
-- fan-out alert (logs `webhook_duplicate_fanout_blocked` + commits cleanly so
-- the admin_bypass_audit row persists). Do NOT remove ON CONFLICT and let the
-- index abort the withAdmin transaction — that would roll back the audit row
-- (Bob R2 R4).
CREATE UNIQUE INDEX orders_session_store_unique ON orders (checkout_session_id, store_id);

-- order_items
CREATE INDEX order_items_order_idx       ON order_items (order_id);
CREATE INDEX order_items_store_idx       ON order_items (store_id);
CREATE INDEX order_items_variant_idx     ON order_items (variant_id) WHERE variant_id IS NOT NULL;

-- order_payouts
CREATE INDEX order_payouts_order_idx     ON order_payouts (order_id);
CREATE INDEX order_payouts_status_idx    ON order_payouts (status);

-- processed_webhook_events
CREATE UNIQUE INDEX processed_webhook_events_unique
  ON processed_webhook_events (psp_provider, psp_event_id);
CREATE INDEX processed_webhook_events_processed_at_idx
  ON processed_webhook_events (processed_at);
```

### 2.5 RLS policies

All four new tables ship with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` from migration zero (Hard Constraint §12.12).

**Pattern (Bob R0):** Mirror the PR #31 shape exactly (`packages/db/src/rls/policies.sql:639–736`):

- The RESTRICTIVE default-deny policy uses `USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass())` — **never** `USING (false)`. A RESTRICTIVE policy is ANDed with permissive policies, so a hard `false` denies everything. The `current_user_id IS NOT NULL OR is_admin_bypass()` form rejects unauthenticated rogue queries while still letting permissive policies and `withAdmin` work.
- Permissive SELECT policies allow the per-row scope (own buyer, own store, staff) OR `app.is_admin_bypass()`. Helper functions live in `policies.sql` §2 (`app.current_user_id()`, `app.current_user_role()`, `app.is_bomy_staff()`, `app.is_admin_bypass()`).
- **Every** INSERT/UPDATE/DELETE policy requires `app.is_admin_bypass()` — no tenant role writes directly. This forces every write through `withAdmin`, which auto-writes the `admin_bypass_audit` row per PR #26's contract. The earlier draft's `order_payouts_admin_finance_all` policy was rejected by Bob for exactly this reason — admin/finance writes via `withTenant` would have skipped the audit row.

#### `orders`

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE  ROW LEVEL SECURITY;

CREATE POLICY orders_default_deny ON orders
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- Permissive SELECT. Both branches are role-gated (Bob R3) so a user who
-- owns both buyer and seller hats only sees what their current role context
-- allows — the seller branch must NOT fire when current_user_role is
-- 'buyer', otherwise shipping_address snapshots leak across the role boundary.
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

-- All writes are admin-bypass only — no tenant context, regardless of role.
CREATE POLICY orders_admin_insert ON orders
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY orders_admin_update ON orders
  FOR UPDATE
  USING (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY orders_admin_delete ON orders
  FOR DELETE USING (app.is_admin_bypass());
```

#### `order_items`

```sql
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_items_default_deny ON order_items
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- SELECT via parent-order ownership. Same role-gating as orders_select
-- (Bob R3) — a store owner acting as buyer must NOT see other buyers'
-- order_items for their store. Each branch checks the role explicitly.
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
  USING (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY order_items_admin_delete ON order_items
  FOR DELETE USING (app.is_admin_bypass());
```

#### `order_payouts`

```sql
ALTER TABLE order_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payouts FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_payouts_default_deny ON order_payouts
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- SELECT: seller_owner sees own store's payouts; staff sees all; admin bypass.
-- Buyer never sees payouts. The seller branch REQUIRES role = 'seller_owner'
-- (Bob R2) — without the role predicate, a user acting in buyer context who
-- happens to own a store would satisfy the ownership EXISTS and leak payout data.
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

-- Writes are admin-bypass only. PR #33 admin/finance UI calls withAdmin
-- (not withTenant). Bob R0: tenant-role writes here would skip the audit row.
CREATE POLICY order_payouts_admin_insert ON order_payouts
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY order_payouts_admin_update ON order_payouts
  FOR UPDATE
  USING (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY order_payouts_admin_delete ON order_payouts
  FOR DELETE USING (app.is_admin_bypass());
```

#### `processed_webhook_events`

Append-only, admin-only. No tenant role has any access.

```sql
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY processed_webhook_events_default_deny ON processed_webhook_events
  AS RESTRICTIVE
  USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());

-- No tenant SELECT/INSERT/UPDATE/DELETE policies — admin bypass only.
CREATE POLICY processed_webhook_events_admin_select ON processed_webhook_events
  FOR SELECT USING (app.is_admin_bypass());

CREATE POLICY processed_webhook_events_admin_insert ON processed_webhook_events
  FOR INSERT WITH CHECK (app.is_admin_bypass());
-- No UPDATE / DELETE policies at all — append-only by omission + RLS.
```

`bomy_app` role grants on all four tables in the migration's role-grant section (mirrors PR #31 `0011` §15).

### 2.6 `platform_config` seeds

```sql
INSERT INTO platform_config (key, value, description) VALUES
  ('regular_order_commission_pct', '25'::jsonb,
   'BOMY platform commission for regular (non-brand-subscription) orders. ' ||
   'Applied at webhook fan-out time. Net-of-PSP-fees. Snapshot stored on orders.bomy_commission_pct. ' ||
   'Editing this rate is gated behind MFA / two-admin approval (Stage 5 §8).'),
  ('order_auto_complete_days', '7'::jsonb,
   'Days from delivered_at before OrderAutoCompleteJob (PR #33) transitions delivered → completed.'),
  ('order_auto_delivered_days', '30'::jsonb,
   'Days from shipped_at before OrderAutoCompleteJob assumes delivery (shipped → delivered fallback).')
ON CONFLICT (key) DO NOTHING;
```

`checkout_enabled` is **not** seeded by this migration. It stays as PR #31's seeded value (`false`) until the post-deploy runbook (§1.3) flips it via the ops DB script.

### 2.7 Drizzle modules

```
packages/db/src/schema/orders.ts              # new
packages/db/src/schema/order_items.ts         # new
packages/db/src/schema/order_payouts.ts       # new
packages/db/src/schema/processed_webhook_events.ts  # new
packages/db/src/schema/enums.ts               # +3 enums
packages/db/src/types.ts                      # +3 status arrays + types
packages/db/src/schema/index.ts               # +4 re-exports
```

CHECKs mirrored in `.ts` modules for type-level documentation; SQL is the source of truth.

---

## 3. Webhook handler architecture

### 3.1 Route plugin entry — `apps/api/src/routes/webhooks/hitpay.ts`

The existing `POST /webhooks/hitpay` plugin keeps its HMAC verify + body parsing + 200-always envelope. The internal routing block (`if (eventType === 'charge.updated')` etc.) gains a new **first** branch that handles checkout-session payment events. Order of dispatch (top to bottom):

1. `eventType === 'charge.updated'` → refund (unchanged).
2. `eventType === 'charge.created'` OR `recurring_billing_id` present → membership (unchanged).
3. **NEW:** `eventType === 'payment_request.completed' | 'payment_request.failed'` AND `payment_request_id` matches a row in `checkout_sessions.psp_payment_request_id` → `handleOrderPayment(...)`.
4. `eventType === 'payment_request.completed' | 'payment_request.failed'` AND `payment_request_id` matches a row in `brand_subscriptions.hitpay_payment_request_id` → existing brand-subscription path.
5. Anything else → `log.warn("unrecognised event shape")`, return 200.

The new branch must **lookup checkout_sessions first** (one indexed SELECT) before falling through to the brand-sub branch — the two table spaces share `payment_request_id` namespace and the wrong dispatcher would silently no-op.

This lookup runs **outside** the fan-out transaction (cheap read, no lock), purely to decide the dispatcher. The fan-out re-reads the session inside its own transaction with `FOR UPDATE`.

### 3.2 Idempotency claim — `claimEvent(...)`

```ts
// apps/api/src/webhooks/hitpay/idempotency.ts

import { createHash } from "node:crypto"

export interface EventIdentity {
  pspProvider: "hitpay"
  pspEventId: string // from Hitpay-Event-Id header
  eventType: string // e.g. "payment_request.completed"
  payloadHash: string // SHA-256 of raw body
}

export function deriveEventIdentity(
  rawBody: string,
  headers: Record<string, string | undefined>,
): EventIdentity {
  const payloadHash = createHash("sha256").update(rawBody).digest("hex")
  const headerEventId = headers["hitpay-event-id"]
  // Fallback: if HitPay ever stops sending Hitpay-Event-Id, the payload hash
  // collapses retries on the same body. Combined with event_type this is
  // sufficient as a stable identity. Logged as a warning so ops sees it.
  const pspEventId =
    typeof headerEventId === "string" && headerEventId.length > 0
      ? headerEventId
      : `derived:${payloadHash}`
  return {
    pspProvider: "hitpay",
    pspEventId,
    eventType: headers["hitpay-event-type"] ?? "unknown",
    payloadHash,
  }
}

export type ClaimResult =
  | { owned: true }
  | { owned: false; existing: { payloadHash: string; eventType: string } }

// Returns `{ owned: true }` if this transaction owns the event.
// Returns `{ owned: false, existing }` so the caller can compare payload_hash
// / event_type and emit an ops-critical alert on mismatch (Bob R5). Caller
// must commit even when `owned: false` (idempotency hits run consistency
// checks then return 200).
export async function claimEvent(tx: Database, identity: EventIdentity): Promise<ClaimResult> {
  const inserted = await tx
    .insert(schema.processedWebhookEvents)
    .values(identity)
    .onConflictDoNothing({
      target: [schema.processedWebhookEvents.pspProvider, schema.processedWebhookEvents.pspEventId],
    })
    .returning({ id: schema.processedWebhookEvents.id })

  if (inserted.length === 1) return { owned: true }

  // Conflict: read the existing row so the caller can detect collisions.
  const existing = await tx
    .select({
      payloadHash: schema.processedWebhookEvents.payloadHash,
      eventType: schema.processedWebhookEvents.eventType,
    })
    .from(schema.processedWebhookEvents)
    .where(
      and(
        eq(schema.processedWebhookEvents.pspProvider, identity.pspProvider),
        eq(schema.processedWebhookEvents.pspEventId, identity.pspEventId),
      ),
    )
    .limit(1)
  if (!existing[0]) {
    throw new Error(`claimEvent: race lost but no row found for ${identity.pspEventId}`)
  }
  return { owned: false, existing: existing[0] }
}
```

The unique constraint on `(psp_provider, psp_event_id)` is the gate. The read-after-conflict is one extra round-trip only on the rare lost-race path.

**Mismatch detection (Bob R5):** when `claimEvent` returns `{ owned: false }`, the caller compares the new identity against the stored one:

```ts
if (
  result.existing.payloadHash !== identity.payloadHash ||
  result.existing.eventType !== identity.eventType
) {
  args.app.log.error(
    {
      event: "webhook_event_id_collision",
      pspEventId: identity.pspEventId,
      existingHash: result.existing.payloadHash,
      newHash: identity.payloadHash,
      existingType: result.existing.eventType,
      newType: identity.eventType,
    },
    "hitpay webhook: duplicate event_id with different payload — possible replay or HitPay bug",
  )
}
```

HitPay should never reuse an event id for a different payload. The handler still proceeds to the consistency check and returns 200 — the 2xx contract is preserved, but ops gets a structured alert.

### 3.3 Lock order (Bob R0 directive)

The fan-out handler acquires row locks in exactly this order. Any deviation creates a deadlock with the `InventoryReservationExpiryJob` (PR #31) and the buyer cancel path (`compensateInitiation`).

| Step | Table                    | Lock                                                                                                          |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1    | `checkout_sessions`      | `SELECT … FOR UPDATE` of the matched session by `psp_payment_request_id`                                      |
| 2    | `inventory_reservations` | `SELECT … FOR UPDATE` of all rows `WHERE checkout_session_id = $sessionId AND status = 'active'`              |
| 3    | `product_variants`       | Atomic `UPDATE … WHERE id = $variantId` — no explicit lock, the WHERE clause + xact serialise updates         |
| 4    | `vouchers`               | Atomic `UPDATE … WHERE id = $voucherId AND reserved_checkout_session_id = $sessionId AND redeemed_at IS NULL` |

The expiry job uses the same order (`FOR UPDATE OF cs, r SKIP LOCKED`, then variant atomic update, then voucher update). The buyer cancel path (`compensateInitiation`) uses the same order. **No path acquires `vouchers` before `product_variants`, and no path acquires `product_variants` before `inventory_reservations`.**

This PR adds a brief comment block to `apps/api/src/webhooks/hitpay/order-fanout.ts` referencing the PR #31 spec §5.1 lock-order section so future contributors do not break the contract.

### 3.4 Top-level handler — `handleOrderPayment`

```ts
// apps/api/src/webhooks/hitpay/order-fanout.ts (new file)

export interface OrderPaymentArgs {
  app: FastifyInstance
  paymentRequestId: string // HitPay payment_request_id (== checkout_sessions.id-bound)
  paymentId: string // HitPay payment_id (one per successful charge)
  status: string // "completed" | "failed" | other
  amountStr: string // "N.NN"
  feesStr: string // "N.NN"
  eventIdentity: EventIdentity
}

export async function handleOrderPayment(args: OrderPaymentArgs): Promise<void> {
  await withAdmin(
    args.app.db.db,
    {
      userId: SYSTEM_ACTOR,
      reason: `hitpay webhook: order payment ${args.eventIdentity.pspEventId}`,
    },
    async (tx) => {
      // Step A: claim idempotency. If already processed, run consistency check
      //         (and event-id collision check per §3.2) then return — no money operations.
      const claim = await claimEvent(tx, args.eventIdentity)

      // Step B: lock session row.
      const session = await selectSessionForUpdate(tx, args.paymentRequestId)
      if (!session) {
        // payment_request_id refers to a checkout_session that no longer
        // exists (impossible in practice; loud log + 200 return).
        args.app.log.error(
          { paymentRequestId: args.paymentRequestId },
          "hitpay webhook: order payment for unknown checkout_session",
        )
        return
      }

      // Step C: short-circuit retried event with the same psp_event_id.
      if (!claim.owned) {
        warnOnEventCollision(args, claim.existing) // §3.2 mismatch detection
        await runConsistencyCheck(tx, session, args)
        return
      }

      // Step D: route by status FIRST (Bob R3). Failed events skip amount
      //         validation entirely — a payment_request.failed with a missing
      //         or unparsable amount must still release reservations + stock
      //         + voucher, not get parked into payment_review_required.
      if (args.status === "failed") {
        await runFailureRelease(tx, session, args)
        return
      }

      // Step E: completed/succeeded path. Validate amount before any money
      //         operations or fan-out.
      if (args.status !== "completed" && args.status !== "succeeded") {
        // Unknown HitPay status on a non-failed event. Loud log, park for ops.
        args.app.log.error(
          { status: args.status, sessionId: session.id },
          "hitpay webhook: unknown payment_request status",
        )
        await parkPaymentReview(tx, session, "amount_mismatch", args) // closest reason
        return
      }

      // (Bob R2) Missing payment_id on a successful event is a HitPay payload
      // bug — fan-out would write blank psp_payment_id and break future
      // idempotency / refund lookups. Stage 4 brand-subscription handler
      // (`apps/api/src/routes/webhooks/hitpay.ts:362`) fails closed on the same
      // condition; mirror it. Park into review for ops.
      if (!args.paymentId) {
        args.app.log.error(
          { sessionId: session.id, paymentRequestId: args.paymentRequestId },
          "hitpay webhook: order payment completed but payment_id missing — parking for review",
        )
        await parkPaymentReview(tx, session, "amount_mismatch", args) // closest reason
        return
      }

      let amountSen: bigint
      try {
        amountSen = parseSen(args.amountStr)
      } catch {
        args.app.log.error(
          { amountStr: args.amountStr, sessionId: session.id },
          "hitpay webhook: order payment amount unparseable — parking for review",
        )
        await parkPaymentReview(tx, session, "amount_mismatch", args)
        return
      }
      if (amountSen !== session.totalBuyerPaysSen) {
        await parkPaymentReview(tx, session, "amount_mismatch", args)
        return
      }

      // Step F: second-barrier idempotency guard — even with a fresh
      //         psp_event_id, only one event can fan out a given session.
      //         If the session is not pending_payment, treat as already-
      //         processed and short-circuit (Bob R4). Locked row above
      //         means this read is consistent.
      if (session.status !== "pending_payment") {
        args.app.log.info(
          { sessionId: session.id, status: session.status, eventId: args.eventIdentity.pspEventId },
          "hitpay webhook: session already in terminal/review state — skipping fan-out",
        )
        await runConsistencyCheck(tx, session, args)
        return
      }

      // Step G: paid-path fan-out.
      await fanOutPaid(tx, session, args)
    },
  )
}
```

### 3.5 Consistency check (idempotency hit branch)

Per Stage 5 spec §4.3 step 2, when `claimEvent` returns `false` the handler verifies the session and its dependents are in the expected steady state:

| Session status                                                  | Expected invariant                                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paid`                                                          | `COUNT(orders) = COUNT(checkout_session_stores)`; all `inventory_reservations.status = 'converted'`; ledger credit row exists with `idempotency_key = 'checkout:{session_id}:credit'` |
| `payment_review_required` w/ reason `amount_mismatch`           | No orders; no ledger; reservations still `active` or `expired` (expiry job may have run); reason set                                                                                  |
| `payment_review_required` w/ reason `invalid_commission_config` | Same as above                                                                                                                                                                         |
| `payment_review_required` w/ reason `voucher_claim_failed`      | Orders exist (fan-out completed); ledger credit exists; voucher row was not claimed (manual recovery)                                                                                 |
| `payment_review_resolved`                                       | Treated like its prior `payment_review_required` profile keyed by `reason`                                                                                                            |
| `failed`                                                        | No orders; no ledger credit; reservations `released` or `expired`; voucher released                                                                                                   |
| Any other status                                                | Ops alert; commit; return 200                                                                                                                                                         |

Mismatches emit an `app.log.error({ event: "consistency_check_failed", ... })` line and otherwise return 200. They never throw — the webhook envelope must keep its 2xx contract.

The consistency-check helper is read-only (SELECTs against locked rows are fine; no writes), so an idempotency hit never re-runs the fan-out.

### 3.6 Paid-path fan-out — `fanOutPaid`

Inside the locked transaction (lock order per §3.3):

1. **Lock reservations:** `SELECT * FROM inventory_reservations WHERE checkout_session_id = $sessionId AND status = 'active' FOR UPDATE` (rows already locked transitively via FK, but the explicit `FOR UPDATE` keeps the order convention explicit).

2. **Capture PSP fee from the webhook payload (Bob R2).** Parse `feesStr` strictly (same `parseSen` helper that already exists in `apps/api/src/routes/webhooks/hitpay.ts`) and persist on the session **before** any split math runs. PR #31 defaulted `checkout_sessions.psp_fee_sen` to `0` — without this step the allocator divides up a zero fee and the `expense:processing_fee` leg never writes, masking real charges from finance.

   ```sql
   -- inside the locked tx
   UPDATE checkout_sessions
      SET psp_fee_sen = $pspFeeSen,
          updated_at  = now()
    WHERE id = $sessionId
   ```

   Validation:
   - `feesStr` must parse via `parseSen` (`^\d+\.\d{2}$`). If unparseable → `parkPaymentReview(tx, session, "amount_mismatch", args)` (closest reason — the webhook payload is malformed; ops alert).
   - `pspFeeSen` may legitimately be `0` (promotional charges); the allocator and the processing-fee leg already handle this.
   - `pspFeeSen` must be `≤ session.total_buyer_pays_sen` — if HitPay claims a fee larger than the gross, that is a payload bug; park for review.

   The value read for downstream allocation is the value just persisted, not the pre-update `session.psp_fee_sen`. Re-read the session row after this UPDATE (the locked SELECT already returned the row; just refresh the in-memory copy with the new value).

3. **Read commission rate (fail-closed):**

   ```sql
   SELECT value FROM platform_config WHERE key = 'regular_order_commission_pct';
   ```

   Validate: result exists; JSON parses to integer; `0 ≤ value ≤ 100`. If any check fails → `parkPaymentReview(tx, session, "invalid_commission_config", args)` and return. No orders, no ledger, no further locks. Ops-critical log (see §6).

4. **Read all `checkout_session_stores` for the session**, sorted ascending by `store_id` for determinism. Read `checkout_session_items` grouped by `store_id`. (Bigger sessions: still under the 500-row scale ceiling — the largest realistic cart has < 50 items.)

5. **PSP fee allocation** (`commission.ts → allocatePspFee`):

   ```
   pspFeeSen = session.psp_fee_sen
   for each store in stores (sorted by store_id ascending), except the last:
     store.psp_fee_allocated_sen = pspFeeSen * (discounted_subtotal + shipping_fee - voucher_contribution)
                                 / total_buyer_pays_sen
     // integer floor; subtract from running pool
   for the last store:
     store.psp_fee_allocated_sen = pspFeeSen - sum(allocated so far)  // absorbs remainder
   ```

   `total_buyer_pays_sen` is `session.total_buyer_pays_sen`, which the CHECK constraint guarantees equals the sum of per-store `(discounted_subtotal + shipping_fee - voucher_contribution)`. So the allocator never divides by zero (we abort earlier if `total_buyer_pays_sen <= 0` via the existing CHECK).

6. **Per-store split** (`commission.ts → computeStoreSplit`):

   ```
   catalog_psp_fee  = floor(psp_fee_allocated * discounted_subtotal / (discounted_subtotal + shipping_fee))
   shipping_psp_fee = psp_fee_allocated - catalog_psp_fee
   net_catalog      = discounted_subtotal - catalog_psp_fee
   seller_share     = floor(net_catalog * (100 - pct) / 100)
   seller_payout    = seller_share + shipping_fee - shipping_psp_fee
   bomy_commission  = net_catalog - seller_share - voucher_contribution
   // bomy_commission absorbs rounding remainder; can be negative.
   ```

   Then assert:

   ```
   seller_payout + bomy_commission + psp_fee_allocated
     = discounted_subtotal + shipping_fee - voucher_contribution
   ```

   This is the same expression the `orders` CHECK enforces; doing it in JS first surfaces bugs as a thrown error in tests rather than a Postgres `check_violation` at insert time.

7. **Insert one `orders` row per store** (ascending `store_id`) using `ON CONFLICT (checkout_session_id, store_id) DO NOTHING RETURNING id` so a stale duplicate-fan-out attempt (Step F bypassed by a future bug) fails gracefully without aborting the transaction. If the INSERT returns 0 rows for any store, this is a duplicate fan-out — `webhook_duplicate_fanout_blocked` at `level: error` with `{ sessionId, storeId }`, **commit the transaction so the `admin_bypass_audit` row persists**, and `return` from the handler. No `order_items`, no ledger writes, no voucher claim, no session status update for that path. The locked Step F status guard should make this branch unreachable in correct code; this is the belt-and-braces (Bob R2). Field-by-field mapping for the normal insert:

   ```ts
   orders.checkout_session_id = session.id
   orders.store_id = csStore.storeId
   orders.buyer_id = session.userId
   orders.currency = session.currency // 'MYR'
   orders.shipping_address = session.shippingAddress // jsonb snapshot
   orders.shipping_fee_sen = csStore.shippingFeeSen
   orders.retail_subtotal_sen = csStore.retailSubtotalSen
   orders.brand_discount_sen = csStore.brandDiscountSen
   orders.discounted_subtotal_sen = csStore.discountedSubtotalSen
   orders.voucher_contribution_sen = csStore.voucherContributionSen
   orders.psp_fee_allocated_sen = split.pspFeeAllocatedSen
   orders.bomy_commission_sen = split.bomyCommissionSen
   orders.bomy_commission_pct = pct
   orders.seller_payout_sen = split.sellerPayoutSen
   orders.payment_status = "paid"
   orders.fulfilment_status = "processing"
   ```

8. **Ledger fan-out.** Single `transactionId = session.id` shared across all legs of this event. Idempotency keys are per-leg, derived from the session/order ids — replays of the same event with the same content would write the same keys, and the unique `(idempotency_key, direction)` index would reject duplicates with a clear Postgres error (which we never reach because `claimEvent` already blocked at step A).

   ```ts
   // One credit (full session gross paid in to BOMY's receivables).
   tx.insert(ledgerEntries).values({
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

   // Per-order: seller payout debit + processing fee debit (both gated on > 0,
   // per ledger_entries.amount_minor > 0 CHECK).
   for (const order of insertedOrders) {
     if (order.sellerPayoutSen > 0n) {
       tx.insert(ledgerEntries).values({
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
       tx.insert(ledgerEntries).values({
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

   **Seller-payout zero edge (Bob R7).** `seller_payout_sen = seller_share + shipping - shipping_psp_fee`. With `commission_pct = 100`, `seller_share = floor(net_catalog × 0 / 100) = 0`. With `shipping = 0` (the seller's `flat_shipping_fee_sen = 0` and the cart has no other shipping line), `shipping - shipping_psp_fee = 0`. So `seller_payout = 0` is reachable. The ledger CHECK `amount_minor > 0` would reject the leg insert. Gate the leg on `> 0` to match the existing pattern used for `processing_fee`. The `orders.seller_payout_sen` column itself is still written as `0` (no constraint violation on the table), so finance can see the row exists and reconcile.

   **Ledger model note (Bob R5).** The model is single-entry-style: credits track revenue inflow, debits track payable/expense outflow. Credits and debits do **not** sum to equal — the implicit difference is BOMY's retained commission for the transaction. This matches Stage 4's brand-subscription pattern (see `apps/api/src/routes/webhooks/hitpay.ts` `handleBrandSubscriptionPayment`). Open question #1 confirms this is acceptable for launch.
   - `sum(amount_minor) FILTER (WHERE direction = 'credit')` for the session = `session.total_buyer_pays_sen`.
   - `sum(amount_minor) FILTER (WHERE direction = 'debit')` for the session = `sum(orders.seller_payout_sen + orders.psp_fee_allocated_sen)` across the session's orders.
   - `credit_total − debit_total` = `sum(orders.bomy_commission_sen)` — BOMY's retained commission. Can be negative when a generous voucher exceeds BOMY's share; log/report on negative per open question #1, do not constrain.

   **Note on voucher contribution:** there is no explicit ledger leg for the voucher_contribution. The voucher amount lives in the `regular_order` credit (= `total_buyer_pays_sen`, which is already net of voucher) and the BOMY share is correspondingly reduced via `bomy_commission_sen = net_catalog - seller_share - voucher_contribution`. The `voucher_fund` revenue source exists on the enum for the wallet/top-up flow (Stage 10+) and is not used here.

9. **Voucher claim** (if `session.voucherId IS NOT NULL`):

   ```sql
   UPDATE vouchers
      SET redeemed_checkout_session_id = $sessionId,
          redeemed_at                  = now(),
          reserved_checkout_session_id = NULL
    WHERE id                           = $voucherId
      AND reserved_checkout_session_id = $sessionId
      AND redeemed_at                  IS NULL
   RETURNING id
   ```

   If 0 rows returned → voucher reservation lost (data integrity issue: the row was released or claimed by another path between PR #31 reserving it and this webhook firing). Set:
   - `checkout_sessions.status = 'payment_review_required'`
   - `checkout_sessions.payment_review_reason = 'voucher_claim_failed'`
     Emit ops-critical alert. Orders and ledger **stay committed** (money has moved; admin reconciles via the admin console session-detail page in PR #33). Then skip step 10 (do not set `status = 'paid'`) and finish step 11 — reservations still transition to `converted` because the orders exist.

10. **Mark session paid:**

```sql
UPDATE checkout_sessions
   SET status = 'paid',
       psp_payment_id = $paymentId,
       updated_at = now()
 WHERE id = $sessionId
   AND status = 'pending_payment'
```

If the voucher claim parked the session in `payment_review_required` (step 9), this step is **skipped** — never overwrite `payment_review_required` with `paid`. The CHECK `status NOT IN ('payment_review_required','payment_review_resolved') OR payment_review_reason IS NOT NULL` keeps the row valid.

11. **Convert reservations:**

    ```sql
    UPDATE inventory_reservations
       SET status = 'converted',
           updated_at = now()
     WHERE checkout_session_id = $sessionId
       AND status = 'active'
    ```

    No need to touch `product_variants` — the stock decrement happened in PR #31. `converted` means "this slot has been sold and the reservation is now historical." The expiry job's candidate filter already excludes `converted`.

12. **Log success** with the structured payload from §6.

### 3.7 Failed-path release — `runFailureRelease`

Triggered by `payment_request.failed`. The full release mirrors the PR #31 `compensateInitiation` helper but is keyed on the webhook event, not buyer action.

Inside the locked transaction (same lock order):

1. If `session.status !== 'pending_payment'` → no-op (already terminal). Log and return 200. (e.g., expiry job got there first and set `expired`; or a previous failed event handled it.)

2. **Release reservations:**

   ```sql
   UPDATE inventory_reservations
      SET status = 'released',
          updated_at = now()
    WHERE checkout_session_id = $sessionId
      AND status = 'active'
   RETURNING variant_id, quantity
   ```

3. **Restore stock** per returned row:

   ```sql
   UPDATE product_variants
      SET stock_count = stock_count + $qty,
          updated_at = now()
    WHERE id = $variantId
   ```

4. **Release voucher** (if any):

   ```sql
   UPDATE vouchers
      SET reserved_checkout_session_id = NULL,
          reserved_at = NULL
    WHERE id = $voucherId
      AND reserved_checkout_session_id = $sessionId
      AND redeemed_at IS NULL
   ```

5. **Mark session failed.** `psp_payment_id` is **conditionally included** in the SET list — only when `args.paymentId` is a non-empty string. The unique index `checkout_sessions_psp_payment_id_unique_idx` (PR #31 `0011_cart_checkout.sql:113`) is partial `WHERE psp_payment_id IS NOT NULL`, so writing `""` IS indexed. Two failed sessions with empty `paymentId` would collide on the unique index, abort the transaction, and **roll back the reservation release / stock restore / voucher release** done in steps 2–4 (Bob R3). Mirror the membership handler's conditional-set pattern at `apps/api/src/routes/webhooks/hitpay.ts:263`.

   Drizzle expression (the conditional spread is what guarantees the empty-string write is impossible):

   ```ts
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
   ```

   Raw-SQL form is similar — the SET list excludes the column when `paymentId` is empty/null:

   ```sql
   -- with payment_id: SET status='failed', psp_payment_id=$paymentId, updated_at=now()
   -- without:         SET status='failed',                             updated_at=now()
   UPDATE checkout_sessions
      SET status = 'failed', ...
    WHERE id = $sessionId
      AND status = 'pending_payment'
   ```

6. Log `event: order_payment_failed`.

No orders, no ledger, no order_payouts.

### 3.8 Park review — `parkPaymentReview`

```ts
async function parkPaymentReview(
  tx: Database,
  session: CheckoutSessionRow,
  reason: "amount_mismatch" | "invalid_commission_config" | "voucher_claim_failed",
  args: OrderPaymentArgs,
): Promise<void> {
  await tx
    .update(schema.checkoutSessions)
    .set({
      status: "payment_review_required",
      paymentReviewReason: reason,
      // psp_payment_id may legitimately be empty on amount_mismatch; only set when present.
      ...(args.paymentId ? { pspPaymentId: args.paymentId } : {}),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.checkoutSessions.id, session.id),
        eq(schema.checkoutSessions.status, "pending_payment"),
      ),
    )
  // Ops-critical alert log (§6) emitted by the caller.
}
```

The guard `status = 'pending_payment'` keeps us from overwriting an already-resolved review row. The CHECK on `(status IN review states) → reason IS NOT NULL` is satisfied because we always set `reason` together with `status`.

---

## 4. State transition reference

```
                       ┌─────────────────────┐
                       │  pending_payment    │  (PR #31 initiated)
                       └─────────┬───────────┘
                                 │
       payment_request.completed │   payment_request.failed
       (amount OK + cfg OK +     │   (HitPay user cancelled / declined)
        voucher claim OK)        │
                                 │
                  ┌──────────────┼──────────────────────────────────┐
                  ▼              ▼                                  ▼
            ┌───────────┐  ┌──────────────────────────┐    ┌────────────────────┐
            │   paid    │  │ payment_review_required  │    │       failed       │
            └───────────┘  └────────────┬─────────────┘    └────────────────────┘
                                        │ admin "mark resolved" (PR #33)
                                        ▼
                              ┌──────────────────────────┐
                              │ payment_review_resolved  │
                              └──────────────────────────┘

      ┌──────────┐     (expiry job; never overwrites post-payment states)
      │ expired  │ ← pending_payment + reservations past grace
      └──────────┘

      ┌────────────┐   (buyer cancel via /checkout/cancelled OR Phase 1b failure)
      │ cancelled  │ ← pending_payment, run compensateInitiation
      └────────────┘
```

| From → To                                               | Trigger                                                  | Effects                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pending_payment → paid`                                | webhook `payment_request.completed`, all guards pass     | Orders + items + ledger + voucher claim + reservations `converted`                                                       |
| `pending_payment → failed`                              | webhook `payment_request.failed`                         | Reservations `released`, stock restored, voucher released                                                                |
| `pending_payment → payment_review_required`             | webhook with amount mismatch / invalid commission config | No money operations; ops alert; review state set                                                                         |
| `pending_payment → paid → payment_review_required`      | webhook completed but voucher claim fails post-fan-out   | Orders + ledger commit; reservations `converted`; voucher unclaimed; review state set with reason `voucher_claim_failed` |
| `pending_payment → expired`                             | expiry job (PR #31)                                      | Reservations `expired`; stock restored; voucher released                                                                 |
| `pending_payment → cancelled`                           | buyer cancel + orphan cleanup                            | Same as expired (different audit trail)                                                                                  |
| `payment_review_required → payment_review_resolved`     | admin action                                             | Resolution note recorded; **PR #33 ships this UI** — this PR only writes the column nullable                             |
| Anything in `paid` / `failed` / `expired` / `cancelled` | (none — terminal in PR #32)                              | Refund flow re-uses `payment_status` on `orders`, not session status                                                     |

---

## 5. File / module layout

```
apps/api/src/routes/webhooks/hitpay.ts                     # +50 LOC routing branch
apps/api/src/webhooks/                                     # new directory
  hitpay/
    order-fanout.ts                                        # handleOrderPayment, fanOutPaid (~250 LOC)
    failure-release.ts                                     # runFailureRelease (~80 LOC)
    park-review.ts                                         # parkPaymentReview, consistency helpers (~80 LOC)
    commission.ts                                          # pure functions (~120 LOC)
    idempotency.ts                                         # claimEvent, deriveEventIdentity (~60 LOC)

packages/db/drizzle/0012_order_webhook_ledger.sql          # migration
packages/db/src/schema/{orders,order_items,order_payouts,processed_webhook_events}.ts  # 4 new modules
packages/db/src/schema/enums.ts                            # +3 enum exports
packages/db/src/schema/index.ts                            # +4 re-exports
packages/db/src/types.ts                                   # +3 status arrays + types
packages/db/src/rls/policies.sql                           # +4 table policy blocks

apps/api/tests/webhooks/hitpay-order.test.ts               # ~25 tests (new file)
apps/api/tests/webhooks/hitpay.test.ts                     # existing — add ~3 routing tests
packages/db/tests/order_webhook.test.ts                    # ~10 schema / RLS / CHECK tests (new file)
```

Why a new `apps/api/src/webhooks/` directory rather than inlining into the route plugin? The route plugin file is already 645 LOC and growing. Per existing precedent in `apps/web/src/app/checkout/`, helpers split by concern (queries / actions / compensate). PR #31 review explicitly liked that split. Mirror it here.

---

## 6. Observability

### 6.1 Pino logs (one line per branch)

| Event                                     | Level   | Fields                                                                                                                                                         |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event: order_payment_paid`               | `info`  | `sessionId`, `paymentId`, `eventId`, `ordersCount`, `bomyCommissionSen`, `pspFeeSen`, `voucherClaimed: boolean`                                                |
| `event: order_payment_failed`             | `info`  | `sessionId`, `paymentId`, `eventId`, `reservationsReleased`, `voucherReleased: boolean`                                                                        |
| `event: order_payment_review`             | `error` | `sessionId`, `paymentId`, `eventId`, `reason`, `expectedAmount`, `receivedAmount?` (for amount_mismatch)                                                       |
| `event: order_payment_idempotent`         | `info`  | `sessionId`, `eventId`, `previousStatus`, `consistencyCheck` (one of `pass` / `fail`)                                                                          |
| `event: voucher_claim_failed`             | `error` | `sessionId`, `voucherId`, `paymentId` — ops-critical                                                                                                           |
| `event: consistency_check_failed`         | `error` | `sessionId`, `eventId`, `mismatchType` (e.g. `orders_count`, `ledger_credit_missing`, `reservations_not_converted`)                                            |
| `event: webhook_event_id_collision`       | `error` | `pspEventId`, `existingHash`, `newHash`, `existingType`, `newType` — emitted by §3.2 when a duplicate `psp_event_id` carries a different payload or event type |
| `event: webhook_duplicate_fanout_blocked` | `error` | `sessionId`, `storeId`, `eventId` — emitted when `orders` INSERT `ON CONFLICT DO NOTHING` returns 0 rows (Step F status guard bypassed by a future bug)        |
| `event: bomy_commission_negative`         | `warn`  | `sessionId`, `orderId`, `bomyCommissionSen` — emitted per-order when `bomy_commission_sen < 0` (open question #1 default: allow + log)                         |

Ops-critical alerts are anything `level: error`. The notifications/alerting wiring lands in PR #34; here we just write the structured logs so PR #34's wire-up has everything it needs.

### 6.2 Tracing

OpenTelemetry spans are emitted by the route plugin envelope (already wired in PR #6). Add one custom attribute on the fan-out span:

```ts
span.setAttribute("bomy.checkout_session_id", session.id)
span.setAttribute("bomy.psp_event_id", eventIdentity.pspEventId)
```

---

## 7. Test matrix

All integration tests run against real Postgres with `BOMY_RLS_READY=1` and the `bomy_app` role applied. HitPay calls are stubbed by dependency injection per Stage 4 pattern; the webhook route's HMAC verify is exercised end-to-end (signed test bodies).

### 7.1 `packages/db/tests/order_webhook.test.ts` — schema + RLS

1. `orders` CHECK rejects: journal balance violation (`seller_payout_sen + bomy_commission_sen + psp_fee_allocated_sen != discounted_subtotal + shipping − voucher`).
2. `orders` CHECK rejects: `discounted_subtotal_sen ≠ retail_subtotal_sen − brand_discount_sen`.
3. `orders` CHECK rejects: `bomy_commission_pct = 101`.
4. `orders` CHECK accepts: `bomy_commission_sen < 0` (legitimate when voucher exceeds BOMY share) iff journal still balances.
5. `order_items` CHECK rejects: `line_total_sen ≠ quantity * unit_price_sen`.
6. RLS: buyer SELECTs own `orders`; cannot SELECT another buyer's.
7. RLS: `seller_owner` SELECTs orders for own store; cannot SELECT another store's.
8. RLS: staff (`bomy_admin`, `bomy_ops`, `bomy_finance`) SELECT all orders.
9. RLS: NO role (`buyer`, `seller_owner`, `bomy_ops`, `bomy_admin`, `bomy_finance`) can INSERT/UPDATE/DELETE on `orders` / `order_items` / `order_payouts` / `processed_webhook_events` under `withTenant`. Each role tested individually to catch the kind of policy regression Bob caught on the first draft (e.g. an `order_payouts_admin_finance_all FOR ALL` permissive policy would let finance write via `withTenant` and skip the audit row).
10. RLS: `processed_webhook_events` not readable under any `withTenant` context; only `withAdmin`.
    10a. RLS: default-deny restrictive policy: any of the four tables with `app.current_user_id` unset AND `app.bypass_rls` unset → SELECT returns zero rows. (Regression for Bob R1 R0: the prior draft used `USING (false)` which would have denied everything; this test would have caught it.)
    10b. **(Bob R2 R3)** `order_payouts` role-predicate guard: a user who owns a store but is acting under `withTenant(..., { userRole: 'buyer' })` cannot SELECT any `order_payouts` row, including rows for their own store. Re-issuing the same query under `withTenant(..., { userRole: 'seller_owner' })` returns the store's rows. Regression for the missing role predicate Bob caught — `s.owner_id = app.current_user_id()` alone would have leaked payout data to buyer-context callers.
    10c. **(Bob R3)** `orders` + `order_items` role-predicate guard: seed a store owned by user `U`, then seed an order placed by a different buyer `B` against that store. Under `withTenant(..., { userId: U, userRole: 'buyer' })`, SELECT on `orders` for that store's rows returns zero rows, and SELECT on `order_items` for the same orders returns zero rows. Under `withTenant(..., { userId: U, userRole: 'seller_owner' })`, both return the seeded rows. This proves the seller branch's role gate prevents a store-owner-acting-as-buyer from seeing other buyers' orders, shipping snapshots, and items.

### 7.2 `apps/api/tests/webhooks/hitpay-order.test.ts` — handler behaviour

#### Routing + identity

11. `payment_request_id` matches `checkout_sessions` → routed to order handler (NOT brand-sub).
12. `payment_request_id` matches `brand_subscriptions` only → existing brand-sub handler fires (unchanged).
13. Missing `Hitpay-Event-Id` header → derived `psp_event_id` via SHA-256(body); warns; still idempotent on repeated body.

#### Idempotency

14. Two identical `payment_request.completed` deliveries (same `Hitpay-Event-Id`) → second is a no-op; ledger credit count = 1; orders count = 1 per store.
15. Second delivery runs consistency check; passes; no error log.
16. Second delivery on `voucher_claim_failed` session: orders+ledger present; voucher unclaimed; consistency check passes.
    16a. **(Bob R5) Duplicate `Hitpay-Event-Id` with different `payload_hash`** (forge two events with the same id but different bodies; verify both signatures) → second delivery emits `event: webhook_event_id_collision` at `level: error` with both hashes; no side effects.
    16b. **(Bob R5) Duplicate `Hitpay-Event-Id` with same hash but different `event_type`** → same collision log; no side effects.
    16c. **(Bob R4) Two `payment_request.completed` deliveries with DIFFERENT `psp_event_id` for the same `payment_request_id`** → first claims, fans out, sets session `paid`. Second claims a fresh `processed_webhook_events` row, locks the session, sees `status = 'paid'` and short-circuits via the §3.4 step F status guard. Exactly one set of orders + ledger. The DB-level `orders_session_store_unique` index never fires (the second event never reaches INSERT) but stands as the belt-and-braces.
    16d. **(Bob R4 belt-and-braces) Manually force the second event past the status guard** (test fixture flips the session back to `pending_payment` between deliveries to simulate buggy code) → second fan-out's `INSERT ... ON CONFLICT (checkout_session_id, store_id) DO NOTHING RETURNING id` returns 0 rows. Handler emits `event: webhook_duplicate_fanout_blocked` at `level: error` and commits. Final state: original orders + ledger unchanged; **second `admin_bypass_audit` row persists** (the tx commits cleanly, not throws — Bob R2-medium fix); no duplicate ledger legs (unique `(idempotency_key, direction)` would have caught them anyway, but the orders INSERT never reaches the ledger step).

#### Paid happy path

17. Single-store cart, no voucher, no brand discount → orders[0]: retail = cart sum, payment_status='paid', fulfilment_status='processing'; ledger 1 credit + 1 debit (seller_payout) + 1 debit (processing_fee); reservations `converted`; session `paid`.
18. Multi-store cart (3 stores), no voucher → 3 orders inserted in ascending store_id order; psp_fee sums exactly to `session.psp_fee_sen` (last store absorbs remainder); journal balance CHECK passes on every row.
19. Voucher present → voucher.redeemed_checkout_session_id set; reserved_checkout_session_id null; redeemed_at set; `voucher_contribution_sen` on order matches `checkout_session_stores`.
20. Brand discount active → orders preserve `brand_discount_sen`; commission computed on `discounted_subtotal_sen` (post-brand-discount) — verifies §3.6 step 6 math.
21. Per-store split: voucher only on one of two stores (proportional allocation guard) → both orders sum to session totals exactly.

#### Review-state guards

22. Webhook amount ≠ `total_buyer_pays_sen` → session `payment_review_required`, reason `amount_mismatch`; no orders; no ledger; reservations untouched; voucher untouched; `psp_payment_id` not set.
    22a. **(Bob R1 R2) Webhook `feesStr` unparseable on `payment_request.completed`** (e.g. `"abc"`) → session `payment_review_required`, reason `amount_mismatch`; no orders; ops log mentions PSP-fee parse failure.
    22b. **(Bob R1 R2) Webhook `feesStr = "1000.00"` with `total_buyer_pays_sen = 50000` (fee > gross)** → review state, reason `amount_mismatch`; no orders.
    22c. **(Bob R2 R2) `payment_request.completed` with empty `payment_id`** → session `payment_review_required`, reason `amount_mismatch`; no orders; no ledger; `psp_payment_id` not set; ops `level: error` "payment_id missing" log. Mirrors Stage 4 brand-sub handler's fail-closed behaviour at `apps/api/src/routes/webhooks/hitpay.ts:362`.
23. `platform_config.regular_order_commission_pct` missing → review state, reason `invalid_commission_config`; no orders; ops-critical log.
24. `platform_config.regular_order_commission_pct = '125'::jsonb` (out of range) → same as #23.
25. `platform_config.regular_order_commission_pct = '"twenty-five"'::jsonb` (non-integer) → same as #23.
26. Voucher claim race (test forces it by NULL-ing `reserved_checkout_session_id` mid-tx via a second connection) → orders + ledger commit; voucher unclaimed; session `payment_review_required` with reason `voucher_claim_failed`; ops-critical log.

#### Failed path

27. `payment_request.failed` → reservations `released`; stock restored; voucher released; session `failed`; no orders; no ledger.
28. `payment_request.failed` on already-expired session → no-op; no log.error.
29. `payment_request.failed` arrives after `payment_request.completed` (out-of-order from HitPay; **different `psp_event_id`**) → second event claims a new `processed_webhook_events` row (idempotency does NOT apply across different event ids — clarified per Bob R2-low). Locked session lookup sees `status = 'paid'`. `runFailureRelease`'s own `status = 'pending_payment'` guard short-circuits at its Step 1 — no reservations touched, no stock changes, no voucher release, session stays `paid`. Sibling case: same `payment_request.failed` event id delivered twice → second is idempotency-collapsed at `claimEvent`.
    29a. **(Bob R3) `payment_request.failed` with `amountStr = ""`** (missing amount in failed event) → routed to `runFailureRelease` BEFORE amount validation; reservations released; stock restored; voucher released; session `failed`. **Not** parked as `amount_mismatch`.
    29b. **(Bob R3) `payment_request.failed` with `amountStr = "0.00"`** → same as 29a; release proceeds.
    29c. **(Bob R1 R3) `payment_request.failed` with `amountStr = "abc"` (unparseable)** → same as 29a; release proceeds. No `parseSen` throw escapes the handler.
    29d. **(Bob R3 R1) Two failed order payments with empty `payment_id`.** Seed two independent `checkout_sessions` in `pending_payment` (different `psp_payment_request_id`, both with `psp_payment_id IS NULL`). Deliver `payment_request.failed` with empty `paymentId` for each. Both webhooks must succeed: each session ends `failed`, each session keeps `psp_payment_id IS NULL` (never set to `""`), each set of reservations is released and stock restored, each voucher released. The partial unique index on `psp_payment_id IS NOT NULL` is **not** violated because no `""` write occurred. Without the conditional-set fix, the second failed delivery would unique-conflict on `""` and roll back the transaction, leaving reservations active and stock under-counted.

#### Lock + race

30. **(superseded by 16c)** Two concurrent `payment_request.completed` deliveries with the **same** `psp_event_id` → one wins the `(psp_provider, psp_event_id)` unique-conflict; the other short-circuits. Exactly one set of orders + ledger. (Different-id case is 16c.)
31. Expiry job fires while webhook is mid-fan-out (two connections; webhook holds session FOR UPDATE) → expiry job's SKIP LOCKED returns 0 candidates for this session; fan-out completes; final state = `paid` with reservations `converted` (not `expired`).

#### PSP fee + commission edges

31a. **(Bob R2) Nonzero `feesStr`** (e.g. `"0.95"` on a `"50.00"` charge, MYR sen 9500) → `checkout_sessions.psp_fee_sen` set to `95n` before split math; allocator sums per-store `psp_fee_allocated_sen` to exactly `95n` (last store absorbs remainder); each order's `psp_fee_allocated_sen` matches.
31b. **(Bob R2) Single-store cart with `feesStr = "0.95"`** → exactly one order with `psp_fee_allocated_sen = 95`; one ledger debit `expense:processing_fee` for `95`.
31c. **(Bob R2) Multi-store cart with `feesStr = "0.07"`** (small fee, three stores) → per-store allocation floors; last store absorbs remainder; `sum(psp_fee_allocated_sen) == 7n`.
31d. **(Bob R7) `commission_pct = 100` + zero shipping → `seller_payout_sen = 0`** → `orders.seller_payout_sen = 0` row inserted (no CHECK violation); **no** `payable:seller_payout` ledger leg written (gated on `> 0`); journal still balances because `bomy_commission_sen` absorbs the full net.

#### Edge cases

32. `voucher_contribution_sen > bomy_share` (negative BOMY commission allowed) → order row passes CHECK; ledger still balances; `event: bomy_commission_negative` emitted at `level: warn`.
33. `psp_fee_sen = 0` (zero-fee promotional charge) → no processing_fee ledger leg written; orders' `psp_fee_allocated_sen = 0`.
34. Session with zero shipping fee (all stores) → `shipping_psp_fee = 0` for every store; seller_payout = seller_share only.
35. Buyer-and-seller-same-user edge case (seller buys from their own store) → orders + ledger still process; no special handling, no exclusion (Stage 5 scope).

### 7.3 `apps/api/tests/webhooks/hitpay.test.ts` — additions to existing file

36. Order event correctly **does not** invoke brand-subscription handler (regression for §3.1 dispatcher order).
37. `Hitpay-Event-Type: charge.updated` with a refund on a checkout_session payment_id → goes to refund handler (existing). Refund handler currently lacks order-payment recognition (Stage 6+); test asserts it logs a warning rather than crashing.
38. Signature failure on order event → 401; no idempotency row written; no session mutation.

---

## 8. Stage 5 / Proposal v2 cross-references

| Constraint                                                                             | Where enforced                                                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Money = `bigint` minor units                                                           | All `orders.*_sen`, `order_items.*_sen`, `ledger_entries.amount_minor` columns are `bigint`                         |
| Commission net-of-fees                                                                 | §3.6 step 6 computes `net_catalog = discounted_subtotal − catalog_psp_fee` before applying `pct`                    |
| Admin-configurable commission                                                          | §3.6 step 3 reads `regular_order_commission_pct` from `platform_config`; fail-closed on missing/invalid             |
| Integer sen math throughout                                                            | `commission.ts` uses only bigint arithmetic; iteration order is ascending `store_id`; last store absorbs remainder  |
| Order CHECK enforces journal balance                                                   | Migration 0012 §2.2 + Drizzle module                                                                                |
| Webhook idempotency via `processed_webhook_events`                                     | §3.2; insert-then-RETURNING on unique constraint                                                                    |
| Webhook never returns non-2xx after money capture                                      | Only signature/auth failures return 4xx (existing route envelope). All business errors → 200 + log.error            |
| Voucher claimed only at webhook time                                                   | §3.6 step 9                                                                                                         |
| All `withAdmin` calls write `admin_bypass_audit`                                       | Single `withAdmin` per webhook event; PR #26 contract                                                               |
| PSP-agnostic order core                                                                | `psp_provider` enum + `psp_payment_request_id` / `psp_payment_id` text columns; no HitPay strings in business logic |
| RLS FORCE on all new tables                                                            | §2.5                                                                                                                |
| `checkout_enabled = true` flip is post-deploy ops action                               | §1.3                                                                                                                |
| Lock order: `checkout_sessions → inventory_reservations → product_variants → vouchers` | §3.3 + comment block in `order-fanout.ts`                                                                           |

---

## 9. Task breakdown (for implementation plan)

This is a sketch — the detailed plan document with checkboxes lives at `docs/superpowers/plans/2026-05-17-pr32-order-webhook-ledger.md` (drafted alongside this spec).

| #   | Task                                                              | Files                                                                                                                       |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Migration 0012 — enums + tables + CHECKs + indexes                | `packages/db/drizzle/0012_order_webhook_ledger.sql`                                                                         |
| 2   | Migration 0012 — RLS policies + role grants                       | same file; `packages/db/src/rls/policies.sql`                                                                               |
| 3   | Migration 0012 — `platform_config` seeds                          | same file                                                                                                                   |
| 4   | Drizzle schema modules + type exports                             | `packages/db/src/schema/{orders,order_items,order_payouts,processed_webhook_events}.ts`, `enums.ts`, `index.ts`, `types.ts` |
| 5   | Schema + RLS tests                                                | `packages/db/tests/order_webhook.test.ts`                                                                                   |
| 6   | `commission.ts` pure functions + unit tests                       | `apps/api/src/webhooks/hitpay/commission.ts` + tests inline                                                                 |
| 7   | `idempotency.ts` (`deriveEventIdentity`, `claimEvent`)            | `apps/api/src/webhooks/hitpay/idempotency.ts`                                                                               |
| 8   | `order-fanout.ts` — `handleOrderPayment` + `fanOutPaid`           | `apps/api/src/webhooks/hitpay/order-fanout.ts`                                                                              |
| 9   | `failure-release.ts` — `runFailureRelease`                        | `apps/api/src/webhooks/hitpay/failure-release.ts`                                                                           |
| 10  | `park-review.ts` — `parkPaymentReview` + consistency-check helper | `apps/api/src/webhooks/hitpay/park-review.ts`                                                                               |
| 11  | Route plugin extension — dispatcher branch + signed-event tests   | `apps/api/src/routes/webhooks/hitpay.ts` + `apps/api/tests/webhooks/hitpay.test.ts`                                         |
| 12  | Full handler integration tests (test matrix §7.2)                 | `apps/api/tests/webhooks/hitpay-order.test.ts`                                                                              |
| 13  | Final smoke + branch hygiene + PR open                            | n/a — process step                                                                                                          |

Estimated total LOC: ~900 implementation + ~1,200 test = ~2,100 LOC. Comparable to PR #31.

Suggested commit granularity: one commit per task (matches PR #31 cadence). Bob review between each.

---

## 10. Open questions for Bob / Charlie

1. **Negative `bomy_commission_sen` floor.** Spec §3.6 step 6 says "BOMY = `net_catalog − seller_share − voucher_contribution`; can be negative." This is correct accounting (voucher cost is BOMY's expense, modeled implicitly). Bob R-defaults: **allow, but log/report for ops.** Implementation: when `bomy_commission_sen < 0`, the fan-out emits `event: bomy_commission_negative` at `level: warn` with `sessionId`, `orderId`, `bomyCommissionSen` so ops sees it in reports. No DB CHECK adjustment (the journal-balance CHECK already permits negative).

2. **`processed_webhook_events` retention.** No TTL or cleanup. Bob R-defaults: **let it grow for launch; partition later.** At HitPay's expected volume (low thousands per month for launch) this is fine for years; add a follow-up note for Stage 7+ partitioning. No code change in PR #32.

3. **Fall-through brand-subscription path on shared `payment_request_id`.** Bob R-defaults: **acceptable.** Stage 4's brand-subscription webhook uses `hitpay_payment_request_id` on `brand_subscriptions`. PR #31 uses `psp_payment_request_id` on `checkout_sessions`. HitPay generates these from the same number space — a brand subscription and a checkout session could in principle share an id, but HitPay's ids are 28+ chars so collision is effectively impossible. The dispatcher's "checkout first, then brand-sub" order in §3.1 is the safety net.

4. **`payment_request.failed` vs HitPay user cancellation.** Bob R-defaults: **acceptable only with the locked-session status guard fixed (Bob R4) — now in place via §3.4 step F.** HitPay sends `payment_request.failed` for both server-side declines and user-cancelled-on-payment-page. Buyer cancellation from inside the BOMY app (`/checkout/cancelled`) already calls `compensateInitiation` directly — the webhook arrives later and finds the session already `cancelled`, so `runFailureRelease`'s `status = 'pending_payment'` guard short-circuits without re-running the release. Worst-case race window: ~30s between buyer cancel and webhook delivery, during which the session is `cancelled` and the webhook is a no-op.

5. **Ops-critical alert wiring.** Bob R-defaults: **defer to PR #34 if structured error logs are complete.** All ops-critical events in §6.1 emit structured Pino lines with consistent `event:` keys (`order_payment_review`, `voucher_claim_failed`, `consistency_check_failed`, `webhook_event_id_collision`, `bomy_commission_negative`). PR #34 wires these to Slack/PagerDuty; PR #32 launch posture is "tail Pino logs in prod."

---

## 11. Implementation plan handoff

The detailed implementation plan (Tasks 1–13 with file-level steps, exact SQL fragments, test scaffolding pointers) belongs in a separate document:

`docs/superpowers/plans/2026-05-17-pr32-order-webhook-ledger.md` — written after this spec is approved by Bob.

Bob's directive for this draft: design first, no implementation, no commits onto `feat/cart-checkout`. This spec lives on `design/pr32-order-webhook-ledger` (a branch off the merged `feat/cart-checkout` → now `main`). After Bob approves, the implementation plan is drafted, then the engineering branch `feat/order-webhook-ledger` is cut from `main` and Tasks 1–13 begin.
