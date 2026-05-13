# Stage 5 — Products & Orders Design

**Date:** 2026-05-13
**Author:** Andy (AI technical lead)
**Status:** Approved by Charlie; Bob review revisions applied 2026-05-13
**Builds on:** Stage 4 (PRs #18–#25), project_membership_model.md, project_commission_rule.md

---

## 1. Scope

Stage 5 delivers the core marketplace transaction layer: sellers list products, buyers browse and purchase, money is accounted for, and sellers can fulfil. It also closes the mandatory Stage 4 deferral (durable admin bypass audit) and replaces all `console.log` email stubs with real delivery.

| #   | Subsystem                                                         |
| --- | ----------------------------------------------------------------- |
| 1   | Admin bypass audit (mandatory prerequisite)                       |
| 2   | Catalog — categories, products, variants, images                  |
| 3   | Seller product CRUD                                               |
| 4   | Storefront — browsing, search, store page                         |
| 5   | Cart + checkout — pricing, inventory reservation, HitPay redirect |
| 6   | Order webhook — payment confirmation, order fan-out, ledger       |
| 7   | Order management — buyer, seller, admin views                     |
| 8   | Notifications + email — real sending; payout record creation      |

**Out of scope for Stage 5:** Stripe / USD orders, seller KYB / automated bank transfers, product reviews, refund flow (schema hooks only), MeiliSearch, weight-based shipping, variant-specific images, per-store SKU uniqueness.

---

## 2. Locked Decisions

| Decision                 | Value                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Currency                 | MYR only. All amounts stored as `bigint` sen. Never floats.                                                                                                                                                                                                                                                                                                                           |
| PSP                      | HitPay only. Order core tables are PSP-agnostic; HitPay identity in provider metadata columns.                                                                                                                                                                                                                                                                                        |
| Commission basis         | Net-of-fees (consistent with Stage 4). `net_catalog = discounted_subtotal − catalog_psp_fee`. Rate = `regular_order_commission_pct` from `platform_config` (default 25). BOMY = `net_catalog − seller_share − voucher_contribution`; Seller = `net_catalog × (100−pct)/100 + shipping_fee − shipping_psp_fee` (integer floor). Applied rate snapshot on `orders.bomy_commission_pct`. |
| Shipping                 | Seller-set flat rate per order. Snapshotted in sen on checkout_session_stores and order. No commission on shipping.                                                                                                                                                                                                                                                                   |
| Stock                    | `stock_count` on `product_variants` = available purchasable quantity. Atomically decremented at checkout initiation; restored on expiry/failure. No separate reservation math on reads.                                                                                                                                                                                               |
| Inventory reservation    | At checkout initiation (not add-to-cart). 30-minute expiry. 5-minute grace before expiry job releases.                                                                                                                                                                                                                                                                                |
| Voucher settlement       | Buyer pays discounted total (`catalog_price − voucher_value`). BOMY funds the voucher from its commission share (can go net-negative). Seller payout is seller-neutral (based on discounted_subtotal, unaffected by platform voucher). Voucher reserved at checkout initiation; claimed at payment confirmation.                                                                      |
| Voucher / brand discount | Mutually exclusive per checkout session. `NOT (voucher_discount_sen > 0 AND brand_discount_total_sen > 0)` enforced by DB CHECK.                                                                                                                                                                                                                                                      |
| Cart / checkout model    | Multi-seller cart. Single HitPay payment per `checkout_session`. One `order` per seller created after payment confirmation via parent `checkout_session`.                                                                                                                                                                                                                             |
| PSP fee split            | `catalog_psp_fee = psp_fee_allocated × discounted_subtotal / (discounted_subtotal + shipping_fee)`. `shipping_psp_fee = psp_fee_allocated − catalog_psp_fee`. Integer arithmetic; last store absorbs remainder.                                                                                                                                                                       |
| Rounding                 | All fee/voucher/commission allocations use integer sen math, deterministic iteration order (ascending store_id), last store absorbs remainder. Rounding always absorbed into `bomy_commission_sen`.                                                                                                                                                                                   |
| Payout                   | Admin-triggered manual payout record creation only (no HitPay Transfers call until seller KYB/bank fields exist). Manual transfer tracked via `manual_ref`.                                                                                                                                                                                                                           |
| Order states             | Separate payment state (`order_payment_status`) and fulfilment state (`order_fulfilment_status`).                                                                                                                                                                                                                                                                                     |
| Fulfilment flow          | `processing → shipped → delivered → completed`. Buyer/seller mark delivered. Auto-complete from `delivered_at + order_auto_complete_days`. Fallback: auto-mark `delivered` from `shipped_at + order_auto_delivered_days`.                                                                                                                                                             |
| Refunds                  | Schema hooks only (`refund_requested_at`, `refunded_at`, `refund_amount_sen`). No refund flow. Explicit Stage 6 defer.                                                                                                                                                                                                                                                                |
| Search                   | PostgreSQL FTS via `tsvector` column + GIN index. MeiliSearch deferred.                                                                                                                                                                                                                                                                                                               |
| Image upload             | Server-side presigned S3 PUT URL (Next.js server action). Client uploads directly to R2/MinIO. No S3 write credentials exposed client-side.                                                                                                                                                                                                                                           |
| Admin bypass audit       | Every `withAdmin` call after PR #26 must write a durable audit row within the same transaction.                                                                                                                                                                                                                                                                                       |

---

## 3. Database Schema

### 3.1 New Enums (added in the migration where first used)

**PR #27 — catalog enums:**

```typescript
product_status: "draft" | "active" | "archived"
```

**PR #30 — checkout / inventory enums:**

```typescript
checkout_session_status: "pending_payment" |
  "paid" |
  "failed" |
  "expired" |
  "cancelled" |
  "payment_review_required" |
  "payment_review_resolved"

inventory_reservation_status: "active" | "released" | "expired" | "converted"

psp_provider: "hitpay" | "stripe"
```

**PR #31 — order enums:**

```typescript
order_payment_status: "pending" | "paid" | "failed" | "refunded"
order_fulfilment_status: "processing" | "shipped" | "delivered" | "completed" | "cancelled"
order_payout_status: "pending" | "processing" | "completed" | "failed"
```

`revenue_source` enum: no new values. Use existing `regular_order` (sale legs), `processing_fee` (PSP fee debit), `voucher_fund` (if needed for future reporting splits).

---

### 3.2 PR #27 — Catalog Schema (migration 0009)

#### `categories`

| Column     | Type                            | Notes                           |
| ---------- | ------------------------------- | ------------------------------- |
| id         | uuid PK                         |                                 |
| name       | text NOT NULL                   |                                 |
| slug       | text UNIQUE NOT NULL            |                                 |
| parent_id  | uuid nullable → categories      | Reserved for nesting (Stage 6+) |
| sort_order | integer NOT NULL default 0      |                                 |
| is_active  | boolean NOT NULL default true   |                                 |
| created_at | timestamptz NOT NULL defaultNow |                                 |

RLS: public read (active only); `bomy_admin` manage all.

#### `products`

| Column          | Type                                                                                                                   | Notes                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| id              | uuid PK                                                                                                                |                                                      |
| store_id        | uuid NOT NULL → stores                                                                                                 |                                                      |
| category_id     | uuid nullable → categories                                                                                             |                                                      |
| name            | text NOT NULL                                                                                                          |                                                      |
| slug            | text NOT NULL                                                                                                          | Unique per store: unique index on `(store_id, slug)` |
| description     | text nullable                                                                                                          |                                                      |
| search_vector   | tsvector GENERATED ALWAYS AS `to_tsvector('english', coalesce(name,'') \|\| ' ' \|\| coalesce(description,''))` STORED | GIN indexed                                          |
| status          | product_status NOT NULL default 'draft'                                                                                |                                                      |
| cover_image_url | text nullable                                                                                                          |                                                      |
| created_at      | timestamptz NOT NULL defaultNow                                                                                        |                                                      |
| updated_at      | timestamptz NOT NULL defaultNow                                                                                        |                                                      |

RLS: public read where `status = 'active'`; `seller_owner` manages own store's products; `bomy_admin/ops` manage all.

Indexes: GIN on `search_vector`; index on `(store_id, status)`; unique on `(store_id, slug)`.

#### `product_variants`

| Column        | Type                            | Notes                                                                                            |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| id            | uuid PK                         |                                                                                                  |
| product_id    | uuid NOT NULL → products        |                                                                                                  |
| name          | text NOT NULL                   | e.g. "M / Red"                                                                                   |
| sku           | text nullable                   | Globally unique WHERE NOT NULL. Stage 6: per-store uniqueness.                                   |
| price_myr_sen | bigint NOT NULL                 | CHECK > 0                                                                                        |
| stock_count   | integer NOT NULL default 0      | CHECK ≥ 0. Available purchasable quantity — decremented at checkout, restored on failure/expiry. |
| attributes    | jsonb NOT NULL default '{}'     | e.g. `{"size":"M","colour":"Red"}`                                                               |
| sort_order    | integer NOT NULL default 0      |                                                                                                  |
| is_active     | boolean NOT NULL default true   |                                                                                                  |
| created_at    | timestamptz NOT NULL defaultNow |                                                                                                  |
| updated_at    | timestamptz NOT NULL defaultNow |                                                                                                  |

RLS: public read (active variants of active products); `seller_owner` manages own.
Indexes: index on `product_id`; unique on `sku` WHERE NOT NULL.

#### `product_images`

| Column     | Type                            | Notes                          |
| ---------- | ------------------------------- | ------------------------------ |
| id         | uuid PK                         |                                |
| product_id | uuid NOT NULL → products        |                                |
| url        | text NOT NULL                   | Full public URL (R2/MinIO CDN) |
| alt_text   | text nullable                   |                                |
| sort_order | integer NOT NULL default 0      |                                |
| created_at | timestamptz NOT NULL defaultNow |                                |

No variant FK. Variant-specific images deferred to Stage 6.
RLS: same as `products`.

---

### 3.3 PR #30 — Checkout + Inventory Schema (migration 0010)

Also modifies existing `vouchers` table (migration 0010, after `checkout_sessions` is created in the same migration):

- ADD `reserved_checkout_session_id` (uuid nullable, proper FK → checkout_sessions — safe because checkout_sessions is created earlier in this same migration)
- ADD `reserved_at` (timestamptz nullable)
- ADD `redeemed_checkout_session_id` (uuid nullable, proper FK → checkout_sessions)
- DROP `redeemed_order_id` (placeholder column, never populated in Stage 4)
- `redeemed_at` already exists — do NOT add; keep as-is

#### `checkout_sessions`

| Column                   | Type                                                       | Notes                                                                                      |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| id                       | uuid PK                                                    | Used as HitPay `reference_number`                                                          |
| user_id                  | uuid NOT NULL → users                                      |                                                                                            |
| currency                 | currency_code NOT NULL default 'MYR'                       |                                                                                            |
| status                   | checkout_session_status NOT NULL default 'pending_payment' |                                                                                            |
| psp_provider             | psp_provider NOT NULL default 'hitpay'                     |                                                                                            |
| psp_payment_request_id   | text nullable                                              | Unique WHERE NOT NULL. Set after HitPay call.                                              |
| psp_payment_id           | text nullable                                              | Unique WHERE NOT NULL. Set by webhook.                                                     |
| psp_payment_url          | text nullable                                              | HitPay hosted page URL                                                                     |
| psp_fee_sen              | bigint NOT NULL default 0                                  | Updated by webhook when actual fee is known.                                               |
| shipping_address         | jsonb NOT NULL                                             | Collected at checkout initiation; copied to each order                                     |
| total_catalog_sen        | bigint NOT NULL                                            | Sum of all line items at catalog price                                                     |
| total_shipping_sen       | bigint NOT NULL                                            | Sum of per-store shipping fees                                                             |
| voucher_id               | uuid nullable → vouchers                                   |                                                                                            |
| voucher_discount_sen     | bigint NOT NULL default 0                                  |                                                                                            |
| brand_discount_total_sen | bigint NOT NULL default 0                                  | Sum of all per-store brand discounts                                                       |
| total_buyer_pays_sen     | bigint NOT NULL                                            | `total_catalog_sen + total_shipping_sen − voucher_discount_sen − brand_discount_total_sen` |
| resolution_note          | text nullable                                              | Admin note when resolving payment_review_required                                          |
| resolved_by              | uuid nullable → users                                      | Admin who resolved                                                                         |
| expires_at               | timestamptz NOT NULL                                       | Checkout initiation + 30 min                                                               |
| created_at               | timestamptz NOT NULL defaultNow                            |                                                                                            |
| updated_at               | timestamptz NOT NULL defaultNow                            |                                                                                            |

CHECKs:

- `NOT (voucher_discount_sen > 0 AND brand_discount_total_sen > 0)` (mutual exclusion)
- `total_buyer_pays_sen = total_catalog_sen + total_shipping_sen − voucher_discount_sen − brand_discount_total_sen` (derived field equality)
- `total_buyer_pays_sen > 0` (cannot initiate a zero-amount HitPay payment)
- `voucher_discount_sen >= 0`
- `brand_discount_total_sen >= 0`
- `total_catalog_sen >= 0`
- `total_shipping_sen >= 0`
- `voucher_discount_sen <= total_catalog_sen` (voucher cannot exceed catalog total; prevents negative buyer payment)

RLS: user sees own; `bomy_admin/ops/finance` see all.
Indexes: unique on `psp_payment_request_id` WHERE NOT NULL; unique on `psp_payment_id` WHERE NOT NULL; index on `(status, expires_at)` for expiry job.

#### `checkout_session_items`

| Column              | Type                                 | Notes                                                            |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| id                  | uuid PK                              |                                                                  |
| checkout_session_id | uuid NOT NULL → checkout_sessions    |                                                                  |
| store_id            | uuid NOT NULL → stores               | Denormalised for fan-out                                         |
| variant_id          | uuid nullable → product_variants     | Nullable: survives variant deletion                              |
| product_snapshot    | jsonb NOT NULL                       | Full product record at checkout time                             |
| variant_snapshot    | jsonb NOT NULL                       | Full variant record at checkout time                             |
| quantity            | integer NOT NULL                     | CHECK > 0                                                        |
| currency            | currency_code NOT NULL default 'MYR' |                                                                  |
| unit_price_sen      | bigint NOT NULL                      | Snapshot of `price_myr_sen` at checkout                          |
| line_total_sen      | bigint NOT NULL                      | `quantity × unit_price_sen`                                      |
| brand_discount_sen  | bigint NOT NULL default 0            | Applied discount for this line (from buyer's brand subscription) |
| created_at          | timestamptz NOT NULL defaultNow      |                                                                  |

CHECKs: `quantity > 0`, `line_total_sen = quantity * unit_price_sen`.
RLS: user sees own (via session join); `bomy_admin/ops` see all.

#### `checkout_session_stores`

| Column                   | Type                                 | Notes                                                 |
| ------------------------ | ------------------------------------ | ----------------------------------------------------- |
| id                       | uuid PK                              |                                                       |
| checkout_session_id      | uuid NOT NULL → checkout_sessions    |                                                       |
| store_id                 | uuid NOT NULL → stores               |                                                       |
| currency                 | currency_code NOT NULL default 'MYR' |                                                       |
| retail_subtotal_sen      | bigint NOT NULL                      | Sum of `line_total_sen` for this store (pre-discount) |
| brand_discount_sen       | bigint NOT NULL default 0            | Buyer's brand subscription discount for this store    |
| discounted_subtotal_sen  | bigint NOT NULL                      | `retail_subtotal_sen − brand_discount_sen`            |
| voucher_contribution_sen | bigint NOT NULL default 0            | Voucher amount allocated to this store (proportional) |
| shipping_fee_sen         | bigint NOT NULL                      | Seller-set flat rate, snapshotted                     |
| psp_fee_allocated_sen    | bigint NOT NULL default 0            | Updated by webhook when PSP fee is known.             |

UNIQUE on `(checkout_session_id, store_id)`.
CHECKs: `retail_subtotal_sen >= 0`, `shipping_fee_sen >= 0`, `brand_discount_sen >= 0`, `brand_discount_sen <= retail_subtotal_sen`, `discounted_subtotal_sen = retail_subtotal_sen − brand_discount_sen`, `discounted_subtotal_sen >= 0`, `voucher_contribution_sen >= 0`.
Computed at checkout initiation; read by webhook for deterministic order fan-out.

#### `inventory_reservations`

| Column              | Type                                                   | Notes     |
| ------------------- | ------------------------------------------------------ | --------- |
| id                  | uuid PK                                                |           |
| variant_id          | uuid NOT NULL → product_variants                       |           |
| checkout_session_id | uuid NOT NULL → checkout_sessions                      |           |
| quantity            | integer NOT NULL                                       | CHECK > 0 |
| status              | inventory_reservation_status NOT NULL default 'active' |           |
| expires_at          | timestamptz NOT NULL                                   |           |
| created_at          | timestamptz NOT NULL defaultNow                        |           |
| updated_at          | timestamptz NOT NULL defaultNow                        |           |

RLS: no direct user access. Managed via `withAdmin`.
Indexes: composite on `(status, expires_at)` for expiry job; index on `checkout_session_id`.

---

### 3.4 PR #31 — Order Schema (migration 0011)

No further `vouchers` changes — the reservation/redemption FKs are proper FKs added in migration 0010 (PR #30), since `checkout_sessions` is created in that same migration.

Adds `processed_webhook_events` (idempotency guard shared across all HitPay webhook event types).

#### `orders`

| Column                   | Type                                                  | Notes                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                       | uuid PK                                               |                                                                                                                                                       |
| checkout_session_id      | uuid NOT NULL → checkout_sessions                     |                                                                                                                                                       |
| store_id                 | uuid NOT NULL → stores                                |                                                                                                                                                       |
| buyer_id                 | uuid NOT NULL → users                                 |                                                                                                                                                       |
| currency                 | currency_code NOT NULL default 'MYR'                  |                                                                                                                                                       |
| shipping_address         | jsonb NOT NULL                                        | Copied from checkout_session at creation                                                                                                              |
| shipping_fee_sen         | bigint NOT NULL                                       | Copied from checkout_session_stores                                                                                                                   |
| retail_subtotal_sen      | bigint NOT NULL                                       |                                                                                                                                                       |
| brand_discount_sen       | bigint NOT NULL default 0                             |                                                                                                                                                       |
| discounted_subtotal_sen  | bigint NOT NULL                                       | `retail_subtotal_sen − brand_discount_sen`                                                                                                            |
| voucher_contribution_sen | bigint NOT NULL default 0                             | Reporting only — not a ledger leg                                                                                                                     |
| psp_fee_allocated_sen    | bigint NOT NULL default 0                             | Set by webhook                                                                                                                                        |
| bomy_commission_sen      | bigint NOT NULL                                       | Net after voucher; can be negative. Absorbs rounding remainder.                                                                                       |
| bomy_commission_pct      | integer NOT NULL                                      | Snapshot of `regular_order_commission_pct` validated and read from platform_config at webhook fan-out time; missing/invalid aborts fan-out (see §4.3) |
| seller_payout_sen        | bigint NOT NULL                                       |                                                                                                                                                       |
| payment_status           | order_payment_status NOT NULL default 'pending'       |                                                                                                                                                       |
| fulfilment_status        | order_fulfilment_status NOT NULL default 'processing' |                                                                                                                                                       |
| carrier                  | text nullable                                         |                                                                                                                                                       |
| tracking_number          | text nullable                                         |                                                                                                                                                       |
| shipped_at               | timestamptz nullable                                  |                                                                                                                                                       |
| delivered_at             | timestamptz nullable                                  |                                                                                                                                                       |
| completed_at             | timestamptz nullable                                  |                                                                                                                                                       |
| refund_requested_at      | timestamptz nullable                                  | Schema hook only — Stage 6 flow                                                                                                                       |
| refunded_at              | timestamptz nullable                                  |                                                                                                                                                       |
| refund_amount_sen        | bigint nullable                                       | Allows partial refunds when flow is built                                                                                                             |
| created_at               | timestamptz NOT NULL defaultNow                       |                                                                                                                                                       |
| updated_at               | timestamptz NOT NULL defaultNow                       |                                                                                                                                                       |

CHECKs:

- `seller_payout_sen + bomy_commission_sen + psp_fee_allocated_sen = discounted_subtotal_sen + shipping_fee_sen − voucher_contribution_sen` (journal balance)
- `discounted_subtotal_sen = retail_subtotal_sen − brand_discount_sen` (derived field equality)
- `bomy_commission_pct BETWEEN 0 AND 100`
- `retail_subtotal_sen >= 0`, `shipping_fee_sen >= 0`
- `brand_discount_sen >= 0`, `brand_discount_sen <= retail_subtotal_sen`
- `discounted_subtotal_sen >= 0`, `voucher_contribution_sen >= 0`

RLS: buyer sees own orders; `seller_owner` sees orders for their store (fulfilment access only — no other buyer profile fields); `bomy_admin/ops/finance` see all.
Indexes: index on `checkout_session_id`; index on `(store_id, fulfilment_status)`; index on `(buyer_id, payment_status)`.

#### `order_items`

| Column           | Type                                 | Notes                               |
| ---------------- | ------------------------------------ | ----------------------------------- |
| id               | uuid PK                              |                                     |
| order_id         | uuid NOT NULL → orders               |                                     |
| variant_id       | uuid nullable → product_variants     | Nullable: survives variant deletion |
| currency         | currency_code NOT NULL default 'MYR' |                                     |
| product_snapshot | jsonb NOT NULL                       |                                     |
| variant_snapshot | jsonb NOT NULL                       |                                     |
| quantity         | integer NOT NULL CHECK > 0           |                                     |
| unit_price_sen   | bigint NOT NULL                      |                                     |
| line_total_sen   | bigint NOT NULL                      |                                     |
| created_at       | timestamptz NOT NULL defaultNow      |                                     |

RLS: same as parent `order`.

#### `order_payouts`

| Column               | Type                                           | Notes                                           |
| -------------------- | ---------------------------------------------- | ----------------------------------------------- |
| id                   | uuid PK                                        |                                                 |
| order_id             | uuid NOT NULL → orders                         |                                                 |
| amount_sen           | bigint NOT NULL                                | = `order.seller_payout_sen` at time of creation |
| currency             | currency_code NOT NULL default 'MYR'           |                                                 |
| psp_provider         | psp_provider nullable                          | Future: when Transfers API is called            |
| psp_transfer_id      | text nullable                                  | Future: HitPay transfer ref                     |
| manual_ref           | text nullable                                  | Admin-entered external bank transfer reference  |
| status               | order_payout_status NOT NULL default 'pending' |                                                 |
| reconciliation_notes | text nullable                                  |                                                 |
| triggered_by         | uuid NOT NULL → users                          | Admin who created the record                    |
| triggered_at         | timestamptz NOT NULL defaultNow                |                                                 |
| completed_at         | timestamptz nullable                           |                                                 |

RLS: `seller_owner` sees own store's payouts (read-only); `bomy_admin/finance` manage.

#### `processed_webhook_events`

| Column       | Type                            | Notes                            |
| ------------ | ------------------------------- | -------------------------------- |
| id           | uuid PK                         |                                  |
| psp_provider | psp_provider NOT NULL           |                                  |
| psp_event_id | text NOT NULL                   |                                  |
| event_type   | text NOT NULL                   | e.g. `payment_request.completed` |
| payload_hash | text NOT NULL                   | SHA-256 of raw request body      |
| processed_at | timestamptz NOT NULL defaultNow |                                  |

UNIQUE on `(psp_provider, psp_event_id)`.

---

### 3.5 Migration CHECK Reference

Exact DB CHECK constraints to implement (implementation checklist for migrations 0010 and 0011):

**`checkout_sessions` (migration 0010):**

```sql
CHECK (NOT (voucher_discount_sen > 0 AND brand_discount_total_sen > 0))
CHECK (total_buyer_pays_sen = total_catalog_sen + total_shipping_sen - voucher_discount_sen - brand_discount_total_sen)
CHECK (total_buyer_pays_sen > 0)
CHECK (voucher_discount_sen >= 0)
CHECK (brand_discount_total_sen >= 0)
CHECK (total_catalog_sen >= 0)
CHECK (total_shipping_sen >= 0)
CHECK (voucher_discount_sen <= total_catalog_sen)
```

**`checkout_session_items` (migration 0010):**

```sql
CHECK (quantity > 0)
CHECK (line_total_sen = quantity * unit_price_sen)
```

**`checkout_session_stores` (migration 0010):**

```sql
CHECK (retail_subtotal_sen >= 0)
CHECK (shipping_fee_sen >= 0)
CHECK (brand_discount_sen >= 0)
CHECK (brand_discount_sen <= retail_subtotal_sen)
CHECK (discounted_subtotal_sen = retail_subtotal_sen - brand_discount_sen)
CHECK (discounted_subtotal_sen >= 0)
CHECK (voucher_contribution_sen >= 0)
```

**`orders` (migration 0011):**

```sql
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

---

## 4. Payment Architecture

### 4.1 Phase 1 — Transaction 1 (validate + create session + reserve stock)

Within a single DB transaction:

1. Validate: all variants exist, `is_active`, belong to active products, `stock_count ≥ requested qty`
2. Validate voucher (if provided): `redeemed_at IS NULL AND reserved_checkout_session_id IS NULL AND expires_at > now() AND user_id = buyer`
3. Compute per-store totals → prepare `checkout_session_stores` values
4. Insert `checkout_sessions` row first (status = `pending_payment`, shipping_address, totals)
5. Insert `checkout_session_items` rows (snapshots)
6. Insert `checkout_session_stores` rows
7. Atomic stock decrement per variant:
   ```sql
   UPDATE product_variants
   SET stock_count = stock_count - $qty
   WHERE id = $variantId AND stock_count >= $qty
   RETURNING id
   ```
   If any variant returns 0 rows → rollback entire transaction ("out of stock")
8. Insert `inventory_reservations` rows (status = `active`, expires_at = now + 30 min)
9. Reserve voucher:
   ```sql
   UPDATE vouchers
   SET reserved_checkout_session_id = $sessionId, reserved_at = now()
   WHERE id = $voucherId
     AND redeemed_at IS NULL
     AND reserved_checkout_session_id IS NULL
     AND expires_at > now()
   ```
   If 0 rows → rollback ("voucher no longer available")
10. Commit

### 4.2 Phase 1b — HitPay call (outside any transaction)

1. Call `createPaymentRequest(amount = total_buyer_pays_sen, reference_number = checkout_session.id, redirect URLs)`
2. **Success →** Transaction 2: `UPDATE checkout_sessions SET psp_payment_request_id, psp_payment_url WHERE id`
3. **HitPay failure OR Transaction 2 failure →** Release path:
   - Release all `active` reservations for session (status → `released`; guarded: only active→released)
   - `UPDATE product_variants SET stock_count = stock_count + qty` (per released reservation)
   - Release voucher: `UPDATE vouchers SET reserved_checkout_session_id = NULL, reserved_at = NULL WHERE reserved_checkout_session_id = $sessionId AND redeemed_at IS NULL`
   - Mark session `cancelled`
4. Redirect buyer to `psp_payment_url`

Sessions with `status = pending_payment` AND `psp_payment_request_id IS NULL` past `expires_at + 5 min` are also cleaned up by the expiry job.

### 4.3 Phase 3 — Webhook Handler (`POST /webhooks/hitpay` extension)

Distinguishing order payments from subscription payments: look up `psp_payment_request_id` in `checkout_sessions` first; if found → order payment path. If not found → existing subscription path.

**Order payment path:**

1. Verify HMAC signature → 401 if invalid (only valid non-2xx response)
2. Look up `checkout_session` by `psp_payment_request_id`. Begin transaction. Claim idempotency immediately — every valid signed event must be recorded, including those parked into `payment_review_required`:
   ```sql
   INSERT INTO processed_webhook_events (psp_provider, psp_event_id, event_type, payload_hash)
   VALUES ($provider, $eventId, $eventType, $hash)
   ON CONFLICT (psp_provider, psp_event_id) DO NOTHING
   RETURNING id
   ```
   If RETURNING yields 0 rows → event already processed. Consistency profile depends on session status:
   - **`status = 'paid'` or `'payment_review_resolved'`** (full fan-out completed): verify `COUNT(orders) = COUNT(checkout_session_stores)`; verify all `inventory_reservations.status = 'converted'`; verify ledger credit row exists (`idempotency_key = 'checkout:{session_id}:credit'`). If any fail → ops alert, commit, return 200.
   - **`status = 'payment_review_required'`** (partial state by design — amount mismatch may have halted before fan-out): no order/reservation/ledger checks. commit, return 200.
   - Any other status → ops alert, commit, return 200 (unexpected; flag for manual review).
3. Validate payload amount matches `checkout_session.total_buyer_pays_sen`. If mismatch → set session `payment_review_required`, ops alert, commit, return 200. (Idempotency row already inserted in step 2 — duplicate delivery will hit the 0-rows path and pass consistency checks.)
4. If `checkout_session.status ≠ 'pending_payment'` → commit, return 200
5. Set `checkout_session.psp_fee_sen` from webhook payload
6. **Fan-out** — read `regular_order_commission_pct` from `platform_config`. **Fail closed:** if the key is missing or the value is not a valid integer between 0 and 100, set session `payment_review_required`, ops-critical alert, commit (idempotency row + review state only — no orders, no ledger), return 200. Do not proceed with fan-out. Otherwise, for each `checkout_session_stores` row (sorted ascending by `store_id` for determinism):
   - Compute `psp_fee_allocated_sen` = `psp_fee_sen × (discounted_subtotal_sen + shipping_fee_sen − voucher_contribution_sen) / total_buyer_pays_sen` (integer; last store absorbs remainder)
   - Compute `catalog_psp_fee = psp_fee_allocated × discounted_subtotal / (discounted_subtotal + shipping_fee)` (integer)
   - Compute `shipping_psp_fee = psp_fee_allocated − catalog_psp_fee`
   - Let `pct = regular_order_commission_pct` (e.g. 25), `net_catalog = discounted_subtotal_sen − catalog_psp_fee`
   - Compute `seller_share_sen = net_catalog × (100 − pct) / 100` (integer floor — seller gets clean share)
   - Compute `seller_payout_sen = seller_share_sen + shipping_fee_sen − shipping_psp_fee`
   - Compute `bomy_commission_sen = net_catalog − seller_share_sen − voucher_contribution_sen` (absorbs integer rounding remainder; can be negative if voucher exceeds BOMY share)
   - Insert `order` (payment_status = `paid`, fulfilment_status = `processing`, `bomy_commission_pct = pct`)
   - Insert `order_items` from `checkout_session_items WHERE store_id`
7. Write ledger — all legs share `transaction_id = checkout_session.id`; each leg has a unique per-leg `idempotency_key`:
   - **One credit** `+total_buyer_pays_sen`, `regular_order`, ref = `checkout_session_id`, idempotency_key = `checkout:{session_id}:credit`
   - **Per-order debit** `-seller_payout_sen`, `regular_order`, ref = `order_id`, idempotency_key = `order:{order_id}:seller_payout`
   - **Per-order debit** `-psp_fee_allocated_sen`, `processing_fee`, ref = `order_id`, idempotency_key = `order:{order_id}:processing_fee`
8. Claim voucher (if session has a voucher):
   ```sql
   UPDATE vouchers
   SET redeemed_checkout_session_id = $sessionId, redeemed_at = now(), reserved_checkout_session_id = NULL
   WHERE id = $voucherId AND reserved_checkout_session_id = $sessionId AND redeemed_at IS NULL
   ```
   If 0 rows returned → voucher reservation was lost (data integrity issue). Set `checkout_session.status = 'payment_review_required'` and proceed to commit. Ops-critical alert. Orders and ledger still commit (money already moved). Admin reconciles via `/checkout-sessions/[sessionId]`.
9. Update `checkout_session.status = 'paid'` (or `payment_review_required` if step 8 triggered it), `psp_payment_id`
10. Update `inventory_reservations.status = 'converted'` WHERE `checkout_session_id`
11. Commit → return 200

### 4.4 Phase 4 — Buyer Return (polling success page)

Same pattern as membership success pages. Polls `checkout_session.status` every 2 seconds for up to 30 seconds. If still `pending_payment` after timeout: display "Your payment is still processing — check your orders page shortly." Session remains valid (30-min reservation window).

### 4.5 Phase 5 — Expiry Job (`InventoryReservationExpiryJob`, every 10 min, ships in PR #30)

1. Query `inventory_reservations WHERE status = 'active' AND expires_at < now() − interval '5 minutes'`
2. For each: check `checkout_session.status NOT IN ('paid', 'payment_review_required', 'payment_review_resolved')` — skip if any post-payment state (webhook delayed, or session in admin review)
3. Atomically transition reservation `active → expired`:
   ```sql
   UPDATE inventory_reservations
   SET status = 'expired', updated_at = now()
   WHERE id = $id AND status = 'active'
   RETURNING quantity, variant_id
   ```
   Only increment stock for rows that transitioned (0 rows returned = already handled)
4. `UPDATE product_variants SET stock_count = stock_count + qty WHERE id = $variantId`
5. Release voucher: `UPDATE vouchers SET reserved_checkout_session_id = NULL, reserved_at = NULL WHERE reserved_checkout_session_id = $sessionId AND redeemed_at IS NULL`
6. If all reservations for session are expired/released: mark `checkout_session.status = 'expired'` only if current status is `pending_payment` (never overwrite post-payment states)
7. Also clean up: sessions with `status = 'pending_payment' AND psp_payment_request_id IS NULL AND expires_at + interval '5 minutes' < now()` → mark `cancelled`, run same release path

---

## 5. Web Routes — `apps/web`

### 5.1 Storefront (PR #29)

| Route                                     | Auth   | Purpose                                                                      |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `GET /products`                           | public | Product listing with search (FTS), category filter, sort. Pagination.        |
| `GET /products/[storeSlug]/[productSlug]` | public | Product detail: images, variant picker, price, stock indicator, add-to-cart. |
| `GET /brands/[slug]`                      | public | Store page: cover, logo, about, active product grid. Links to subscribe.     |

FTS query: `WHERE search_vector @@ plainto_tsquery('english', $query)` with `ts_rank` ordering.

### 5.2 Cart + Checkout (PR #30)

| Route / Action                   | Auth      | Purpose                                                                            |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| Cart state                       | logged in | Client-side cart (server validates all items at checkout initiation).              |
| `POST /checkout` (server action) | logged in | Checkout initiation: Phases 1 + 1b above. Redirects to HitPay.                     |
| `GET /checkout/success`          | logged in | Polling success page (Phase 4).                                                    |
| `GET /checkout/cancelled`        | logged in | Buyer cancelled on HitPay page — display message, restore cart from session items. |

Checkout page collects: shipping address, voucher code (optional), presents per-store subtotals and grand total before redirecting.

### 5.3 Order Management — Buyer (PR #32)

| Route                   | Auth        | Purpose                                                                                                                                                                                                                                      |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /orders`           | buyer       | All orders grouped by `checkout_session_id`. Shows per-session: total paid, voucher used, date; per-order: store, items summary, fulfilment status, tracking. Checkout-level total rendered once (not per order) to avoid voucher confusion. |
| `GET /orders/[orderId]` | buyer (own) | Full order detail: items (from snapshots), shipping address, seller name, fulfilment status, tracking, financial breakdown (buyer sees: item total, discount, shipping, total paid — not internal commission).                               |

Server action: `confirmDelivery(orderId)` — sets `fulfilment_status = 'delivered'`, `delivered_at = now()`. Guard: buyer's own order, current status = `shipped`.

### 5.4 Seller Dashboard Additions (PRs #28, #32)

| Route                                      | Auth         | Purpose                                                                                                                                        |
| ------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /seller/dashboard/products`           | seller_owner | List own products. Create new. Filter by status.                                                                                               |
| `GET /seller/dashboard/products/new`       | seller_owner | Create product form: name, category, description, variants (name, price, stock, attributes), images (presigned upload).                        |
| `GET /seller/dashboard/products/[id]/edit` | seller_owner | Edit product. Archive. Add/edit/remove variants. Manage images.                                                                                |
| `GET /seller/dashboard/orders`             | seller_owner | All orders for own store. Filter by `fulfilment_status`. Columns: order ID, buyer (initials only), items summary, payout amount, status, date. |
| `GET /seller/dashboard/orders/[orderId]`   | seller_owner | Order detail: full shipping address (fulfilment access), items, payout amount, tracking entry form.                                            |

Server actions:

- `createProduct(...)` / `updateProduct(...)` / `archiveProduct(...)` — via `withTenant`
- `getPresignedUploadUrl(filename, contentType)` — server-side; returns presigned PUT URL for direct-to-R2 upload
- `enterTracking(orderId, carrier, trackingNumber)` — sets `shipped_at = now()`, `fulfilment_status = 'shipped'`. Works for both `processing → shipped` (first entry) and re-entry while `shipped`. Guard: seller's own store.
- `markDelivered(orderId)` — seller marks delivered (in-person). Guard: own store, status = `shipped`.

---

## 6. API Routes — `apps/api`

### 6.1 `POST /webhooks/hitpay` (extended, PR #31)

Existing handler updated to distinguish order payments from subscription payments by `psp_payment_request_id` lookup. Order payment path follows Phase 3 above. Existing subscription paths unchanged.

### 6.2 No new public API routes in Stage 5

All buyer/seller interactions are Next.js server actions. The existing `/internal/jobs/*` pattern may be extended in PR #33 for manual email/notification triggers.

---

## 7. Background Jobs

| Job                             | PR  | Schedule        | Logic                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InventoryReservationExpiryJob` | #30 | Every 10 min    | Release expired active reservations; restore stock; release voucher; expire/cancel session. Grace period: 5 min after `expires_at`. Skip if session is `paid`, `payment_review_required`, or `payment_review_resolved` (any post-payment state). Only mark session `expired` if current status is `pending_payment`. |
| `OrderAutoCompleteJob`          | #33 | Daily 03:00 MYT | `delivered → completed` after `delivered_at + order_auto_complete_days` days. Fallback: `shipped → delivered` after `shipped_at + order_auto_delivered_days` days (for unconfirmed deliveries). Sets `completed_at`.                                                                                                 |

`platform_config` seeds (migration 0012 in PR #32):

- `order_auto_complete_days` = 7
- `order_auto_delivered_days` = 30

---

## 8. Admin Routes — `apps/admin` (PR #32)

| Route                                | Purpose                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /orders`                        | All orders. Filter: `payment_status`, `fulfilment_status`, store, date range. "Payment review required" filter JOINs to `checkout_sessions.status = 'payment_review_required'`.                                                                                                                                                                                                 |
| `GET /orders/[orderId]`              | Full detail: all financial fields including `bomy_commission_sen`, `voucher_contribution_sen`. Links to checkout session.                                                                                                                                                                                                                                                       |
| `GET /checkout-sessions/[sessionId]` | Session detail. If `payment_review_required`: shows "Mark Resolved" form (note field) → sets status `payment_review_resolved`, records `resolved_by`, `resolution_note`.                                                                                                                                                                                                        |
| `GET /payouts`                       | All `order_payouts`. Filter by `status`. "Create Payout Record" button on eligible orders (`fulfilment_status = 'completed'`, no existing `pending/processing/completed` payout). Creates `order_payouts` row (status = `pending`, `triggered_by = admin`). Admin enters `manual_ref` after external bank transfer. "Mark Completed" sets status = `completed`, `completed_at`. |
| `GET /payouts/reconciliation`        | Orders where `bomy_commission_sen < 0` (net-negative due to voucher). Sessions with `payment_review_required` or `payment_review_resolved`.                                                                                                                                                                                                                                     |

**`regular_order_commission_pct` display:** The existing `/config` page (`apps/admin/src/app/config/page.tsx`) reads all `platform_config` rows. Once migration 0011 seeds the key, it appears automatically — no PR #32 code change required for display.

**Deferred — commission rate editing:** Editing `regular_order_commission_pct` via the admin UI is deferred beyond Stage 5. Reason: changing a live financial constant requires MFA/two-admin approval and a durable audit trail that does not exist yet. Risk: the rate can only be changed via DB migration for now. Acceptance: default 25 covers launch; any change before a UI edit workflow is built must go through a migration with an explicit `withAdmin` + audit entry.

---

## 9. Notifications (PR #33 wires all stubs to real sending)

| Event                       | Recipient | Template                                                             |
| --------------------------- | --------- | -------------------------------------------------------------------- |
| Order created (webhook)     | Buyer     | Order confirmation with item list, total, store name                 |
| Order created (webhook)     | Seller    | New order alert with items and shipping address                      |
| Tracking entered            | Buyer     | Shipment notification with carrier + tracking number                 |
| Order completed             | Buyer     | Delivery confirmation                                                |
| Payout record created       | Seller    | Payout notification with amount (note: manual transfer, not instant) |
| Membership renewal reminder | Member    | (Stage 4 stub — wired in PR #33)                                     |
| Voucher issued              | Member    | (Stage 4 stub — wired in PR #33)                                     |
| Seller application received | Applicant | (Stage 3 stub — wired in PR #33)                                     |

Email provider: SMTP via Mailhog locally; SendGrid or Postmark in production (same `SMTP_HOST/PORT/USER/PASS` vars). `EMAIL_FROM` configures sender address.

---

## 10. New Environment Variables

| Variable        | App(s)             | Notes                                                                                              |
| --------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `S3_PUBLIC_URL` | apps/api, apps/web | Public CDN base URL for reading stored images (R2 public domain in prod; MinIO public URL locally) |
| `SMTP_USER`     | apps/api           | SMTP authentication username (e.g. `apikey` for SendGrid)                                          |
| `SMTP_PASS`     | apps/api           | SMTP password / API key. Never commit.                                                             |
| `EMAIL_FROM`    | apps/api           | Sender address (e.g. `noreply@bomy.my`)                                                            |

Existing `S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET` and `SMTP_HOST / SMTP_PORT / SMTP_SECURE` already documented in root `.env.example` — no rename needed.

---

## 11. PR Breakdown

| PR  | Branch                     | Scope                                                                                                                                                                                                                                                                                                              | Model  |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| #26 | `feat/admin-bypass-audit`  | Migration 0008: `admin_bypass_audit` table. Update `withAdmin` in `packages/db/src/tenant.ts` to write audit row within same transaction. Retrofit `apps/api/src/routes/webhooks/hitpay.ts` + all `apps/api/src/jobs/*.ts`. Integration tests.                                                                     | Opus   |
| #27 | `feat/catalog-schema`      | Migration 0009: `categories`, `products`, `product_variants`, `product_images`. Catalog enums. RLS policies. FTS GIN index. Integration tests for RLS.                                                                                                                                                             | Sonnet |
| #28 | `feat/seller-product-crud` | `apps/web /seller/dashboard/products` — create, edit, archive products + variants + images. Server actions via `withTenant`. Presigned upload via `getPresignedUploadUrl`.                                                                                                                                         | Sonnet |
| #29 | `feat/storefront`          | `apps/web /products`, `/products/[storeSlug]/[productSlug]`, `/brands/[slug]` store page. FTS search. Category filter. Add-to-cart (client state).                                                                                                                                                                 | Sonnet |
| #30 | `feat/cart-checkout`       | Migration 0010: checkout session tables + inventory enums + voucher field additions. Cart UI. Checkout initiation flow (Phases 1 + 1b). `InventoryReservationExpiryJob`. Buyer success/cancelled pages.                                                                                                            | Opus   |
| #31 | `feat/order-webhook`       | Migration 0011: order tables + order enums + `processed_webhook_events`. Seed `regular_order_commission_pct = 25` into `platform_config`. Extend `POST /webhooks/hitpay` for order payments. Ledger fan-out.                                                                                                       | Opus   |
| #32 | `feat/order-management`    | `apps/web /orders`, `/orders/[orderId]`, `/seller/dashboard/orders`. `apps/admin /orders`, `/checkout-sessions/[sessionId]`, `/payouts`. Seller tracking. Buyer confirm-delivery. Admin payout record creation. Migration 0012: `platform_config` seeds (`order_auto_complete_days`, `order_auto_delivered_days`). | Sonnet |
| #33 | `feat/notifications-email` | Real email sending (SendGrid/Postmark via SMTP). Wire all `console.log` stubs across Stage 4 + Stage 5. `OrderAutoCompleteJob`. Update `.env.example` with new vars.                                                                                                                                               | Sonnet |

---

## 12. Hard Constraints (must not violate)

1. **All monetary values as `bigint` (sen).** Never floats.
2. **Commission is net-of-fees and admin-configurable.** `net_catalog = discounted_subtotal − catalog_psp_fee`. `pct = regular_order_commission_pct` from `platform_config` — seeded as 25 in migration 0011. Webhook must validate this is present and a valid integer (0–100) before fan-out; if not → `payment_review_required` (see §4.3 step 6). Seller = `net_catalog × (100−pct)/100 + shipping − shipping_psp_fee` (integer floor). BOMY = `net_catalog − seller_share − voucher_contribution` (absorbs rounding; can be negative). Applied rate snapshot on `orders.bomy_commission_pct`.
3. **Integer sen math throughout.** All fee/voucher/commission allocations use integer arithmetic. Deterministic iteration order (ascending `store_id`). Last store absorbs rounding remainder into `bomy_commission_sen`.
4. **Order CHECK enforces journal balance.** `seller_payout_sen + bomy_commission_sen + psp_fee_allocated_sen = discounted_subtotal_sen + shipping_fee_sen − voucher_contribution_sen` on every order row.
5. **Webhook idempotency via `processed_webhook_events`.** Insert at transaction start; unique constraint is the gate. On conflict: verify full consistency (session status, order count, reservations, ledger) before returning 200.
6. **Webhook never returns non-2xx after money capture.** Only signature/auth failures return 4xx. All post-payment business errors return 200 with ops alert and `payment_review_required` state.
7. **Stock decrement is atomic.** `UPDATE ... WHERE stock_count >= qty RETURNING id`. Never SELECT-then-UPDATE.
8. **Voucher reserved at checkout initiation; released on expiry/failure; claimed on payment.** Never first-claimed at webhook time.
9. **No `withAdmin` without durable audit row after PR #26.** Every `withAdmin` call in PRs #27–#33 must be covered by the auto-write in `packages/db/src/tenant.ts`.
10. **PSP-agnostic order core.** HitPay identity in provider metadata columns only (`psp_provider`, `psp_payment_request_id`, `psp_payment_id`). No HitPay-specific column names in business logic tables.
11. **No payout API calls until KYB/bank fields exist.** Stage 5 creates `order_payouts` records only. `manual_ref` for external tracking. HitPay Transfers deferred.
12. **RLS FORCE on all new tables from migration zero.**
13. **No secrets in repo.** `S3_SECRET_KEY`, `SMTP_PASS`, `HITPAY_API_KEY`, `INTERNAL_API_SECRET` in `.env.local` only.
