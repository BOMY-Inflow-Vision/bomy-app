# PR #31 Cart + Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PR #31 (`feat/cart-checkout`) — checkout session schema, server-side initiation flow (Phase 1 + Phase 1b), HitPay redirect, compensation helper, expiry job, and supporting UI surfaces. Per spec `docs/superpowers/specs/2026-05-15-pr31-cart-checkout-design.md`.

**Architecture:** Migration 0011 lands four new tables plus voucher/store column additions; all writes to checkout tables go through `withAdmin` (durable audit per PR #26). Buyer-scoped `withTenant` paths are SELECT-only on checkout tables. `initiateCheckout` runs Phase 1 inside a single `withAdmin` transaction (advisory lock + single-pending guard + stock decrement + voucher reserve + session/items/stores inserts + inventory reservations), commits, then calls HitPay outside the transaction (Phase 1b). Failures at any post-Phase-1 step trigger `compensateInitiation` (idempotent, ownership-guarded). A background job (`*/10 * * * *`) releases expired reservations, restores stock, releases vouchers, and cancels orphan sessions.

**Tech Stack:** TypeScript strict, Drizzle ORM (Postgres 16), Next.js 15 App Router (Server Components + server actions), Fastify scheduler (`apps/api`), Zod for input validation, Vitest with real Postgres for integration tests, HitPay client at `@bomy/hitpay`. RLS via `app.current_user_id() / app.is_bomy_staff() / app.is_admin_bypass()` from `packages/db/src/rls/policies.sql`. Money throughout as `bigint` sen.

**Reference:** Spec at `docs/superpowers/specs/2026-05-15-pr31-cart-checkout-design.md` is committed at `4d61a66`. This plan derefences the spec — tasks below say "per spec §X.Y" for anything load-bearing.

**Pre-conditions verified before starting:**

- Branch `feat/cart-checkout` exists locally, branched from `main` at `53948d7`.
- Spec is committed at `4d61a66` (this plan adds the second commit).
- `checkout_enabled` will be seeded as `false`. **Must remain `false` until PR #32 is deployed and smoke-tested.**

---

## File Structure

### Files created

| Path                                                       | Purpose                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/db/drizzle/0011_cart_checkout.sql`               | Migration: enums, tables, indexes, ALTERs, RLS, seed.                                                            |
| `packages/db/src/schema/checkout_sessions.ts`              | Drizzle definition.                                                                                              |
| `packages/db/src/schema/checkout_session_items.ts`         | Drizzle definition.                                                                                              |
| `packages/db/src/schema/checkout_session_stores.ts`        | Drizzle definition.                                                                                              |
| `packages/db/src/schema/inventory_reservations.ts`         | Drizzle definition.                                                                                              |
| `packages/db/tests/cart_checkout.test.ts`                  | Schema + RLS integration tests.                                                                                  |
| `apps/web/src/lib/money.ts`                                | `senToMyr(bigint): string` helper.                                                                               |
| `apps/web/src/lib/shipping-address-schema.ts`              | Shared Zod schema (client + server).                                                                             |
| `apps/web/src/lib/checkout-errors.ts`                      | `CheckoutError` class + error-code → user-copy map.                                                              |
| `apps/web/src/app/checkout/queries.ts`                     | Pure computation helpers + DB read helpers shared by preview & initiate.                                         |
| `apps/web/src/app/checkout/actions.ts`                     | Server actions: `initiateCheckout`, `priceCheckoutPreview`, `cancelPendingCheckout`, `getCheckoutSessionStatus`. |
| `apps/web/src/app/checkout/compensate.ts`                  | `compensateInitiation` helper.                                                                                   |
| `apps/web/src/app/checkout/page.tsx`                       | Server Component shell.                                                                                          |
| `apps/web/src/app/checkout/checkout-form.tsx`              | Client component: form, voucher dropdown, preview, submit.                                                       |
| `apps/web/src/app/checkout/success/page.tsx`               | Server shell.                                                                                                    |
| `apps/web/src/app/checkout/success/poller.tsx`             | Client polling.                                                                                                  |
| `apps/web/src/app/checkout/cancelled/page.tsx`             | Server shell.                                                                                                    |
| `apps/web/src/app/checkout/cancelled/cancel-trigger.tsx`   | Client auto-POST.                                                                                                |
| `apps/web/tests/checkout/initiate.test.ts`                 | Phase 1 + 1b integration tests.                                                                                  |
| `apps/web/tests/checkout/preview.test.ts`                  | Preview math tests.                                                                                              |
| `apps/web/tests/checkout/cancel.test.ts`                   | Cancel + compensation tests.                                                                                     |
| `apps/api/src/jobs/inventory-reservation-expiry.ts`        | Expiry job logic.                                                                                                |
| `apps/api/tests/jobs/inventory-reservation-expiry.test.ts` | Job tests.                                                                                                       |

### Files modified

| Path                                 | Change                                            |
| ------------------------------------ | ------------------------------------------------- |
| `packages/db/src/schema/enums.ts`    | Add 3 new enums.                                  |
| `packages/db/src/schema/stores.ts`   | Add `flatShippingFeeSen` column.                  |
| `packages/db/src/schema/vouchers.ts` | Drop `redeemedOrderId`; add 3 new columns.        |
| `packages/db/src/schema/index.ts`    | Export 4 new schema modules.                      |
| `packages/db/src/rls/policies.sql`   | Append RLS policies for 4 new tables.             |
| `apps/web/src/app/cart/page.tsx`     | Add "Proceed to Checkout" link + footer copy.     |
| `apps/api/src/scheduler.ts`          | Register `inventory_reservation_expiry` schedule. |

---

## Task 1: Migration 0011 — full migration (DDL + RLS + seed) in one commit

**Why combined:** RLS and table DDL must land together. A partial migration leaves rows readable/writable by unauthorised paths during deploy. One file, one commit, one migration apply. The migration writes the policies inline (matching the codebase convention from 0008/0009); `packages/db/src/rls/policies.sql` is also updated so the policies are reflected in the canonical RLS doc.

**Files:**

- Create: `packages/db/drizzle/0011_cart_checkout.sql`
- Modify: `packages/db/src/rls/policies.sql` (append matching policy definitions for canonical RLS reference)

- [ ] **Step 1: Create the migration file with enums + ALTERs**

```sql
-- 0011_cart_checkout.sql
-- Stage 5 PR #31: checkout sessions, inventory reservations, voucher
-- reservation/redemption FKs, store flat shipping fee, gate seed.

BEGIN;

-- 1. New enums
CREATE TYPE checkout_session_status AS ENUM (
  'pending_payment','paid','failed','expired','cancelled',
  'payment_review_required','payment_review_resolved'
);
CREATE TYPE inventory_reservation_status AS ENUM (
  'active','released','expired','converted'
);
CREATE TYPE psp_provider AS ENUM ('hitpay','stripe');

-- 2. ALTER stores: flat shipping fee
ALTER TABLE stores
  ADD COLUMN flat_shipping_fee_sen bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT stores_flat_shipping_fee_sen_chk CHECK (flat_shipping_fee_sen >= 0);
```

Open the file with this header; continue with the table DDL in steps 2-5.

- [ ] **Step 2: Append `checkout_sessions` table DDL**

```sql
-- 3. checkout_sessions
CREATE TABLE checkout_sessions (
  id                       uuid PRIMARY KEY,
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency                 currency_code NOT NULL DEFAULT 'MYR',
  status                   checkout_session_status NOT NULL DEFAULT 'pending_payment',
  psp_provider             psp_provider NOT NULL DEFAULT 'hitpay',
  psp_payment_request_id   text,
  psp_payment_id           text,
  psp_payment_url          text,
  psp_fee_sen              bigint NOT NULL DEFAULT 0,
  shipping_address         jsonb NOT NULL,
  total_catalog_sen        bigint NOT NULL,
  total_shipping_sen       bigint NOT NULL,
  voucher_id               uuid REFERENCES vouchers(id) ON DELETE SET NULL,
  voucher_discount_sen     bigint NOT NULL DEFAULT 0,
  brand_discount_total_sen bigint NOT NULL DEFAULT 0,
  total_buyer_pays_sen     bigint NOT NULL,
  payment_review_reason    text,
  resolution_note          text,
  resolved_by              uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at               timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_sessions_payment_review_reason_chk
    CHECK (payment_review_reason IS NULL OR payment_review_reason IN
           ('amount_mismatch','invalid_commission_config','voucher_claim_failed')),
  CONSTRAINT checkout_sessions_review_state_chk
    CHECK (status NOT IN ('payment_review_required','payment_review_resolved')
           OR payment_review_reason IS NOT NULL),
  CONSTRAINT checkout_sessions_voucher_brand_xor_chk
    CHECK (NOT (voucher_discount_sen > 0 AND brand_discount_total_sen > 0)),
  CONSTRAINT checkout_sessions_total_derived_chk
    CHECK (total_buyer_pays_sen =
           total_catalog_sen + total_shipping_sen
           - voucher_discount_sen - brand_discount_total_sen),
  CONSTRAINT checkout_sessions_total_positive_chk
    CHECK (total_buyer_pays_sen > 0),
  CONSTRAINT checkout_sessions_voucher_nonneg_chk    CHECK (voucher_discount_sen >= 0),
  CONSTRAINT checkout_sessions_brand_nonneg_chk      CHECK (brand_discount_total_sen >= 0),
  CONSTRAINT checkout_sessions_catalog_nonneg_chk    CHECK (total_catalog_sen >= 0),
  CONSTRAINT checkout_sessions_shipping_nonneg_chk   CHECK (total_shipping_sen >= 0),
  CONSTRAINT checkout_sessions_voucher_cap_chk
    CHECK (voucher_discount_sen <= total_catalog_sen)
);
```

- [ ] **Step 3: Append `checkout_session_items` + `checkout_session_stores` DDL**

```sql
-- 4. checkout_session_items
CREATE TABLE checkout_session_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  store_id            uuid NOT NULL REFERENCES stores(id)            ON DELETE RESTRICT,
  variant_id          uuid REFERENCES product_variants(id)           ON DELETE SET NULL,
  product_snapshot    jsonb NOT NULL,
  variant_snapshot    jsonb NOT NULL,
  quantity            integer NOT NULL,
  currency            currency_code NOT NULL DEFAULT 'MYR',
  unit_price_sen      bigint NOT NULL,
  line_total_sen      bigint NOT NULL,
  brand_discount_sen  bigint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_session_items_qty_chk        CHECK (quantity > 0),
  CONSTRAINT checkout_session_items_line_total_chk CHECK (line_total_sen = quantity * unit_price_sen)
);

-- 5. checkout_session_stores
CREATE TABLE checkout_session_stores (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id      uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  store_id                 uuid NOT NULL REFERENCES stores(id)            ON DELETE RESTRICT,
  currency                 currency_code NOT NULL DEFAULT 'MYR',
  retail_subtotal_sen      bigint NOT NULL,
  brand_discount_sen       bigint NOT NULL DEFAULT 0,
  discounted_subtotal_sen  bigint NOT NULL,
  voucher_contribution_sen bigint NOT NULL DEFAULT 0,
  shipping_fee_sen         bigint NOT NULL,
  psp_fee_allocated_sen    bigint NOT NULL DEFAULT 0,
  CONSTRAINT checkout_session_stores_uniq UNIQUE (checkout_session_id, store_id),
  CONSTRAINT checkout_session_stores_retail_nonneg_chk    CHECK (retail_subtotal_sen >= 0),
  CONSTRAINT checkout_session_stores_shipping_nonneg_chk  CHECK (shipping_fee_sen >= 0),
  CONSTRAINT checkout_session_stores_brand_nonneg_chk     CHECK (brand_discount_sen >= 0),
  CONSTRAINT checkout_session_stores_brand_cap_chk        CHECK (brand_discount_sen <= retail_subtotal_sen),
  CONSTRAINT checkout_session_stores_discounted_chk       CHECK (discounted_subtotal_sen = retail_subtotal_sen - brand_discount_sen),
  CONSTRAINT checkout_session_stores_discounted_nonneg_chk CHECK (discounted_subtotal_sen >= 0),
  CONSTRAINT checkout_session_stores_voucher_nonneg_chk   CHECK (voucher_contribution_sen >= 0)
);
```

- [ ] **Step 4: Append `inventory_reservations` table DDL**

```sql
-- 6. inventory_reservations
CREATE TABLE inventory_reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id          uuid NOT NULL REFERENCES product_variants(id)  ON DELETE RESTRICT,
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  quantity            integer NOT NULL,
  status              inventory_reservation_status NOT NULL DEFAULT 'active',
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_reservations_qty_chk CHECK (quantity > 0)
);
```

- [ ] **Step 5: Append ALTER vouchers + indexes**

```sql
-- 7. ALTER vouchers: add 3 new FK columns; drop redeemed_order_id placeholder
ALTER TABLE vouchers
  ADD COLUMN reserved_checkout_session_id uuid REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  ADD COLUMN reserved_at                  timestamptz,
  ADD COLUMN redeemed_checkout_session_id uuid REFERENCES checkout_sessions(id) ON DELETE SET NULL;

ALTER TABLE vouchers DROP COLUMN redeemed_order_id;

-- 8. Indexes (per spec §2.4)
CREATE INDEX checkout_sessions_user_idx
  ON checkout_sessions (user_id);
CREATE INDEX checkout_sessions_user_pending_idx
  ON checkout_sessions (user_id, status) WHERE status = 'pending_payment';
CREATE UNIQUE INDEX checkout_sessions_psp_payment_request_unique_idx
  ON checkout_sessions (psp_payment_request_id) WHERE psp_payment_request_id IS NOT NULL;
CREATE UNIQUE INDEX checkout_sessions_psp_payment_id_unique_idx
  ON checkout_sessions (psp_payment_id) WHERE psp_payment_id IS NOT NULL;
CREATE INDEX checkout_sessions_status_expires_idx
  ON checkout_sessions (status, expires_at);

CREATE INDEX checkout_session_items_session_idx
  ON checkout_session_items (checkout_session_id);
CREATE INDEX checkout_session_items_session_store_idx
  ON checkout_session_items (checkout_session_id, store_id);
CREATE INDEX checkout_session_items_variant_idx
  ON checkout_session_items (variant_id);
CREATE INDEX checkout_session_items_store_idx
  ON checkout_session_items (store_id);

CREATE INDEX checkout_session_stores_session_idx
  ON checkout_session_stores (checkout_session_id);
CREATE INDEX checkout_session_stores_store_idx
  ON checkout_session_stores (store_id);

CREATE INDEX inventory_reservations_status_expires_idx
  ON inventory_reservations (status, expires_at);
CREATE INDEX inventory_reservations_session_idx
  ON inventory_reservations (checkout_session_id);
CREATE INDEX inventory_reservations_variant_idx
  ON inventory_reservations (variant_id);

CREATE INDEX vouchers_available_user_idx
  ON vouchers (user_id, expires_at)
  WHERE redeemed_at IS NULL AND reserved_checkout_session_id IS NULL;

COMMIT;
```

**Important:** Do NOT close `COMMIT;` yet — remove the trailing `COMMIT;` line from Step 5 (or leave it and edit it down). Steps 6-11 below extend the same migration file with RLS ENABLE/FORCE, policies, and the `checkout_enabled = false` seed. The final `COMMIT;` lands at the end of Step 11.

(Task 2 is absorbed into Task 1 — DDL + RLS + seed must land together to avoid any window where tables exist without policies.)

- [ ] **Step 6: Append RLS ENABLE/FORCE for all 4 new tables**

Open `0011_cart_checkout.sql`, remove the trailing `COMMIT;`, and append:

```sql
-- 9. Enable + force RLS on all 4 new tables
ALTER TABLE checkout_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions       FORCE  ROW LEVEL SECURITY;
ALTER TABLE checkout_session_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_session_items  FORCE  ROW LEVEL SECURITY;
ALTER TABLE checkout_session_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_session_stores FORCE  ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations  FORCE  ROW LEVEL SECURITY;

-- 10. Seed platform_config.checkout_enabled = false
INSERT INTO platform_config (key, value, description)
VALUES (
  'checkout_enabled',
  'false'::jsonb,
  'Master gate for /checkout server action. Flip to true only after PR #32 webhook fan-out is live, smoke-tested, and ops accepts stores.flat_shipping_fee_sen values.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Append RLS policies to `packages/db/src/rls/policies.sql`**

Open `packages/db/src/rls/policies.sql`. After the existing storefront RLS section, append:

```sql
-- ============================================================
-- Stage 5 PR #31: Cart + Checkout RLS policies
-- All writes to checkout-related tables are app.is_admin_bypass() only.
-- Buyer (withTenant) paths get SELECT only. Staff may SELECT.
-- ============================================================

-- checkout_sessions
CREATE POLICY checkout_sessions_buyer_select ON checkout_sessions
  FOR SELECT
  USING (
    app.current_user_id() = user_id
    OR app.is_bomy_staff()
    OR app.is_admin_bypass()
  );

CREATE POLICY checkout_sessions_admin_insert ON checkout_sessions
  FOR INSERT
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_sessions_admin_update ON checkout_sessions
  FOR UPDATE
  USING (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_sessions_admin_delete ON checkout_sessions
  FOR DELETE
  USING (app.is_admin_bypass());

-- checkout_session_items
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

CREATE POLICY checkout_session_items_admin_insert ON checkout_session_items
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_session_items_admin_update ON checkout_session_items
  FOR UPDATE USING (app.is_admin_bypass()) WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_session_items_admin_delete ON checkout_session_items
  FOR DELETE USING (app.is_admin_bypass());

-- checkout_session_stores
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

CREATE POLICY checkout_session_stores_admin_insert ON checkout_session_stores
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_session_stores_admin_update ON checkout_session_stores
  FOR UPDATE USING (app.is_admin_bypass()) WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_session_stores_admin_delete ON checkout_session_stores
  FOR DELETE USING (app.is_admin_bypass());

-- inventory_reservations: staff/admin read, admin-only write
CREATE POLICY inventory_reservations_staff_select ON inventory_reservations
  FOR SELECT
  USING (app.is_admin_bypass() OR app.is_bomy_staff());

CREATE POLICY inventory_reservations_admin_insert ON inventory_reservations
  FOR INSERT WITH CHECK (app.is_admin_bypass());

CREATE POLICY inventory_reservations_admin_update ON inventory_reservations
  FOR UPDATE USING (app.is_admin_bypass()) WITH CHECK (app.is_admin_bypass());

CREATE POLICY inventory_reservations_admin_delete ON inventory_reservations
  FOR DELETE USING (app.is_admin_bypass());
```

- [ ] **Step 3: Include policies.sql in the migration**

Open `packages/db/drizzle/0011_cart_checkout.sql` and **before** the final `COMMIT;`, append:

```sql
-- 11. Append RLS policies. Run policies.sql by including the relevant section.
-- (In this codebase the policies.sql file is concatenated into migrations
--  by the seed/test helpers; see the catalog migration 0009 for the convention.
--  If catalog used inline policy DDL, copy the inline form. Verify the local
--  convention before committing.)
```

**Verify**: Look at how `0009_catalog_schema.sql` handles RLS. If it inlines policy SQL → copy that pattern (inline the policies into 0011 too). If it references `policies.sql` via a separate apply step → leave 0011 with just the ENABLE/FORCE statements; the test/seed harness applies `policies.sql` separately.

```bash
grep -n "POLICY" packages/db/drizzle/0009_catalog_schema.sql | head -5
```

If policies are inlined in 0009 → inline them in 0011 as well (copy from `policies.sql` content of Step 2 into the migration before `COMMIT;`).
If 0009 only ENABLEs RLS (no `CREATE POLICY`) → keep `policies.sql` separate (Step 2 already wrote the policies there).

- [ ] **Step 4: Re-apply the migration fresh and verify**

```bash
docker compose -f infra/docker/compose.yml exec -T postgres psql -U bomy -c 'DROP DATABASE IF EXISTS bomy;'
docker compose -f infra/docker/compose.yml exec -T postgres psql -U bomy -c 'CREATE DATABASE bomy;'
# Apply 0000-0011 + policies.sql via existing seeding script
pnpm --filter @bomy/db migrate
```

Expected: no errors. The `platform_config` row exists:

```bash
psql $DATABASE_URL -c "SELECT key, value FROM platform_config WHERE key = 'checkout_enabled'"
```

Expected: `checkout_enabled | false`.

- [ ] **Step 5: Commit RLS + seed**

```bash
git add packages/db/drizzle/0011_cart_checkout.sql packages/db/src/rls/policies.sql
git commit -m "feat(db): migration 0011 RLS — buyer-select-only on checkout tables, admin-only writes, checkout_enabled=false seed"
```

---

## Task 3: Drizzle schema modules

**Files:**

- Create: `packages/db/src/schema/checkout_sessions.ts`
- Create: `packages/db/src/schema/checkout_session_items.ts`
- Create: `packages/db/src/schema/checkout_session_stores.ts`
- Create: `packages/db/src/schema/inventory_reservations.ts`
- Modify: `packages/db/src/schema/enums.ts`
- Modify: `packages/db/src/schema/stores.ts`
- Modify: `packages/db/src/schema/vouchers.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Add enums to `enums.ts`**

Open `packages/db/src/schema/enums.ts`. Add (after existing enums):

```ts
import { pgEnum } from "drizzle-orm/pg-core"

// ... existing exports ...

export const checkoutSessionStatusEnum = pgEnum("checkout_session_status", [
  "pending_payment",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "payment_review_required",
  "payment_review_resolved",
])

export const inventoryReservationStatusEnum = pgEnum("inventory_reservation_status", [
  "active",
  "released",
  "expired",
  "converted",
])

export const pspProviderEnum = pgEnum("psp_provider", ["hitpay", "stripe"])
```

- [ ] **Step 2: Update `stores.ts` — add `flatShippingFeeSen`**

In `packages/db/src/schema/stores.ts`, inside the columns object (after `description`):

```ts
flatShippingFeeSen: bigint("flat_shipping_fee_sen", { mode: "bigint" }).notNull().default(0n),
```

Add the `bigint` import at the top if not present.

- [ ] **Step 3: Update `vouchers.ts` — drop `redeemedOrderId`, add 3 new fields**

Remove the line `redeemedOrderId: uuid("redeemed_order_id"),` and the explanatory comment paragraph above it (mentioning "soft FK"). Add after `redeemedAt`:

```ts
reservedCheckoutSessionId: uuid("reserved_checkout_session_id"),
reservedAt: timestamp("reserved_at", { withTimezone: true }),
redeemedCheckoutSessionId: uuid("redeemed_checkout_session_id"),
```

Note: The Drizzle FK definitions for `reserved_checkout_session_id` and `redeemed_checkout_session_id` are encoded in the SQL migration but cannot reference `checkoutSessions` here without a circular import (vouchers ←→ checkoutSessions). Leave the columns as bare `uuid` in Drizzle; the FK is enforced by the migration.

- [ ] **Step 4: Create `checkout_sessions.ts` Drizzle module**

```ts
// packages/db/src/schema/checkout_sessions.ts
import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { currencyCodeEnum } from "./enums.js"
import { checkoutSessionStatusEnum, pspProviderEnum } from "./enums.js"
import { users } from "./users.js"
import { vouchers } from "./vouchers.js"

export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: currencyCodeEnum("currency").notNull().default("MYR"),
    status: checkoutSessionStatusEnum("status").notNull().default("pending_payment"),
    pspProvider: pspProviderEnum("psp_provider").notNull().default("hitpay"),
    pspPaymentRequestId: text("psp_payment_request_id"),
    pspPaymentId: text("psp_payment_id"),
    pspPaymentUrl: text("psp_payment_url"),
    pspFeeSen: bigint("psp_fee_sen", { mode: "bigint" }).notNull().default(0n),
    shippingAddress: jsonb("shipping_address").notNull(),
    totalCatalogSen: bigint("total_catalog_sen", { mode: "bigint" }).notNull(),
    totalShippingSen: bigint("total_shipping_sen", { mode: "bigint" }).notNull(),
    voucherId: uuid("voucher_id").references(() => vouchers.id, { onDelete: "set null" }),
    voucherDiscountSen: bigint("voucher_discount_sen", { mode: "bigint" }).notNull().default(0n),
    brandDiscountTotalSen: bigint("brand_discount_total_sen", { mode: "bigint" })
      .notNull()
      .default(0n),
    totalBuyerPaysSen: bigint("total_buyer_pays_sen", { mode: "bigint" }).notNull(),
    paymentReviewReason: text("payment_review_reason"),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("checkout_sessions_user_idx").on(t.userId),
    userPendingIdx: index("checkout_sessions_user_pending_idx")
      .on(t.userId, t.status)
      .where(sql`status = 'pending_payment'`),
    pspRequestUnique: uniqueIndex("checkout_sessions_psp_payment_request_unique_idx")
      .on(t.pspPaymentRequestId)
      .where(sql`psp_payment_request_id IS NOT NULL`),
    pspPaymentIdUnique: uniqueIndex("checkout_sessions_psp_payment_id_unique_idx")
      .on(t.pspPaymentId)
      .where(sql`psp_payment_id IS NOT NULL`),
    statusExpiresIdx: index("checkout_sessions_status_expires_idx").on(t.status, t.expiresAt),
    // CHECK constraints are declared in the migration; Drizzle mirrors via `check()` if needed for type ergonomics
  }),
)
```

- [ ] **Step 5: Create `checkout_session_items.ts`**

```ts
// packages/db/src/schema/checkout_session_items.ts
import { bigint, index, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { checkoutSessions } from "./checkout_sessions.js"
import { currencyCodeEnum } from "./enums.js"
import { productVariants } from "./product_variants.js"
import { stores } from "./stores.js"

export const checkoutSessionItems = pgTable(
  "checkout_session_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productSnapshot: jsonb("product_snapshot").notNull(),
    variantSnapshot: jsonb("variant_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    currency: currencyCodeEnum("currency").notNull().default("MYR"),
    unitPriceSen: bigint("unit_price_sen", { mode: "bigint" }).notNull(),
    lineTotalSen: bigint("line_total_sen", { mode: "bigint" }).notNull(),
    brandDiscountSen: bigint("brand_discount_sen", { mode: "bigint" }).notNull().default(0n),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("checkout_session_items_session_idx").on(t.checkoutSessionId),
    sessionStoreIdx: index("checkout_session_items_session_store_idx").on(
      t.checkoutSessionId,
      t.storeId,
    ),
    variantIdx: index("checkout_session_items_variant_idx").on(t.variantId),
    storeIdx: index("checkout_session_items_store_idx").on(t.storeId),
  }),
)
```

- [ ] **Step 6: Create `checkout_session_stores.ts`**

```ts
// packages/db/src/schema/checkout_session_stores.ts
import { bigint, index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { checkoutSessions } from "./checkout_sessions.js"
import { currencyCodeEnum } from "./enums.js"
import { stores } from "./stores.js"

export const checkoutSessionStores = pgTable(
  "checkout_session_stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    currency: currencyCodeEnum("currency").notNull().default("MYR"),
    retailSubtotalSen: bigint("retail_subtotal_sen", { mode: "bigint" }).notNull(),
    brandDiscountSen: bigint("brand_discount_sen", { mode: "bigint" }).notNull().default(0n),
    discountedSubtotalSen: bigint("discounted_subtotal_sen", { mode: "bigint" }).notNull(),
    voucherContributionSen: bigint("voucher_contribution_sen", { mode: "bigint" })
      .notNull()
      .default(0n),
    shippingFeeSen: bigint("shipping_fee_sen", { mode: "bigint" }).notNull(),
    pspFeeAllocatedSen: bigint("psp_fee_allocated_sen", { mode: "bigint" }).notNull().default(0n),
  },
  (t) => ({
    sessionStoreUnique: uniqueIndex("checkout_session_stores_uniq").on(
      t.checkoutSessionId,
      t.storeId,
    ),
    sessionIdx: index("checkout_session_stores_session_idx").on(t.checkoutSessionId),
    storeIdx: index("checkout_session_stores_store_idx").on(t.storeId),
  }),
)
```

- [ ] **Step 7: Create `inventory_reservations.ts`**

```ts
// packages/db/src/schema/inventory_reservations.ts
import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { checkoutSessions } from "./checkout_sessions.js"
import { inventoryReservationStatusEnum } from "./enums.js"
import { productVariants } from "./product_variants.js"

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    status: inventoryReservationStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusExpiresIdx: index("inventory_reservations_status_expires_idx").on(t.status, t.expiresAt),
    sessionIdx: index("inventory_reservations_session_idx").on(t.checkoutSessionId),
    variantIdx: index("inventory_reservations_variant_idx").on(t.variantId),
  }),
)
```

- [ ] **Step 8: Update `packages/db/src/schema/index.ts`**

Add (alphabetical order):

```ts
export * from "./checkout_session_items.js"
export * from "./checkout_session_stores.js"
export * from "./checkout_sessions.js"
export * from "./inventory_reservations.js"
```

- [ ] **Step 9: Typecheck**

```bash
pnpm --filter @bomy/db typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit Drizzle schema**

```bash
git add packages/db/src/schema/
git commit -m "feat(db): drizzle schema for checkout sessions + voucher/store column changes"
```

---

## Task 4: Schema + RLS integration tests

**Files:**

- Create: `packages/db/tests/cart_checkout.test.ts`

- [ ] **Step 1: Write the failing test file skeleton (schema/CHECK coverage)**

```ts
// packages/db/tests/cart_checkout.test.ts
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"

import { setupTestDb, type TestDb } from "./helpers/setup"
import { schema, withTenant, withAdmin } from "@bomy/db"

describe("cart_checkout migration", () => {
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

  describe("schema CHECKs", () => {
    test("checkout_sessions rejects voucher_discount > 0 AND brand_discount_total > 0", async () => {
      const buyer = await db.seed.user()
      await expect(
        db.raw.execute(sql`
        INSERT INTO checkout_sessions (
          id, user_id, status, shipping_address, total_catalog_sen,
          total_shipping_sen, voucher_discount_sen, brand_discount_total_sen,
          total_buyer_pays_sen, expires_at
        ) VALUES (
          gen_random_uuid(), ${buyer.id}::uuid, 'pending_payment', '{}'::jsonb,
          10000, 0, 1000, 2000, 7000, now() + interval '30 minutes'
        )
      `),
      ).rejects.toThrow(/voucher_brand_xor/)
    })

    test("checkout_sessions rejects total_buyer_pays mismatch with derived formula", async () => {
      /* ... */
    })
    test("checkout_sessions rejects total_buyer_pays = 0", async () => {
      /* ... */
    })
    test("checkout_sessions rejects voucher_discount > total_catalog", async () => {
      /* ... */
    })

    test("checkout_session_stores rejects brand_discount > retail_subtotal", async () => {
      /* ... */
    })
    test("checkout_session_stores rejects discounted_subtotal mismatch", async () => {
      /* ... */
    })

    test("stores.flat_shipping_fee_sen rejects negative", async () => {
      const owner = await db.seed.user()
      await expect(
        db.raw.execute(sql`
        UPDATE stores SET flat_shipping_fee_sen = -1 WHERE owner_id = ${owner.id}::uuid
      `),
      ).rejects.toThrow(/flat_shipping_fee_sen_chk/)
    })

    test("vouchers.redeemed_order_id column has been dropped", async () => {
      const { rows } = await db.raw.execute(sql`
        SELECT column_name FROM information_schema.columns
         WHERE table_name = 'vouchers' AND column_name = 'redeemed_order_id'
      `)
      expect(rows).toHaveLength(0)
    })

    test("vouchers_available_user_idx exists", async () => {
      const { rows } = await db.raw.execute(sql`
        SELECT 1 FROM pg_indexes WHERE indexname = 'vouchers_available_user_idx'
      `)
      expect(rows).toHaveLength(1)
    })
  })

  describe("RLS — buyer-scoped (withTenant) is SELECT-only on checkout tables", () => {
    test("buyer reads own checkout_session; cannot read another buyer's", async () => {
      /* implement */
    })
    test("buyer cannot INSERT checkout_sessions even with user_id = self", async () => {
      /* implement */
    })
    test("buyer cannot UPDATE own checkout_session", async () => {
      /* implement */
    })
    test("buyer cannot DELETE own checkout_session", async () => {
      /* implement */
    })
    test("buyer cannot INSERT/UPDATE/DELETE checkout_session_items (parent owned)", async () => {
      /* implement */
    })
    test("buyer cannot INSERT/UPDATE/DELETE checkout_session_stores (parent owned)", async () => {
      /* implement */
    })
  })

  describe("RLS — staff (withTenant + bomy_ops) can SELECT but not write", () => {
    test("staff reads any checkout_session", async () => {
      /* implement */
    })
    test("staff cannot INSERT a checkout_session", async () => {
      /* implement */
    })
    test("staff cannot UPDATE a checkout_session", async () => {
      /* implement */
    })
  })

  describe("RLS — inventory_reservations", () => {
    test("buyer (withTenant) cannot SELECT inventory_reservations", async () => {
      /* implement */
    })
    test("staff (withTenant) can SELECT inventory_reservations", async () => {
      /* implement */
    })
    test("buyer (withTenant) cannot INSERT inventory_reservations", async () => {
      /* implement */
    })
    test("staff (withTenant) cannot INSERT inventory_reservations", async () => {
      /* implement */
    })
    test("withAdmin can INSERT, UPDATE, SELECT inventory_reservations", async () => {
      /* implement */
    })
  })
})
```

- [ ] **Step 2: Run the file (expecting compile errors / `withTenant` import issues)**

```bash
pnpm --filter @bomy/db test cart_checkout.test.ts
```

Expected: FAIL — either compile errors (helper signatures changed) or all `/* implement */` tests pass vacuously.

- [ ] **Step 3: Flesh out each test body using existing patterns from `packages/db/tests/catalog.test.ts` and `rls.test.ts`**

Open `packages/db/tests/catalog.test.ts` and `packages/db/tests/rls.test.ts` to study the seeding pattern (`db.seed.user`, `db.seed.store`, `db.seed.product`, etc.) and the `withTenant` / `withAdmin` call signatures. Implement each test in the order above. **Use `await expect(...).rejects.toThrow(...)` for CHECK violations** and **`await expect(... ).rejects.toThrow(/permission denied|new row violates|relation/i)` or assert `length === 0` for RLS denials.** When a write is silently denied (RLS USING returning empty + RESTRICTIVE default-deny), the UPDATE/DELETE doesn't throw but returns 0 rows — check `.returning({ id })`.

For inserts that should be blocked, run them in a `withTenant({ db, userId, userRole })` transaction and use `await expect(tx.insert(...).values(...)).rejects.toThrow(/policy/i)` or check that nothing landed afterward via a `withAdmin` read.

- [ ] **Step 4: Run all tests until green**

```bash
pnpm --filter @bomy/db test cart_checkout.test.ts
```

Expected: All tests pass. If any test fails, debug the cause. RLS issues are usually:

- Missing `WITH CHECK` on a policy (insert succeeds when it shouldn't).
- Wrong predicate on the SELECT policy.
- Default-deny policy missing or overridden.

- [ ] **Step 5: Commit**

```bash
git add packages/db/tests/cart_checkout.test.ts
git commit -m "test(db): schema CHECKs + RLS coverage for migration 0011"
```

---

## Task 5: Money helper

**Files:**

- Create: `apps/web/src/lib/money.ts`
- Create: `apps/web/tests/lib/money.test.ts` (if test dir exists; else inline) — actually use existing test setup

- [ ] **Step 1: Write failing test for `senToMyr`**

```ts
// apps/web/tests/lib/money.test.ts
import { describe, expect, test } from "vitest"
import { senToMyr } from "@/lib/money"

describe("senToMyr", () => {
  test("2999n → '29.99'", () => expect(senToMyr(2999n)).toBe("29.99"))
  test("0n → '0.00'", () => expect(senToMyr(0n)).toBe("0.00"))
  test("100n → '1.00'", () => expect(senToMyr(100n)).toBe("1.00"))
  test("1n → '0.01'", () => expect(senToMyr(1n)).toBe("0.01"))
  test("99n → '0.99'", () => expect(senToMyr(99n)).toBe("0.99"))
  test("100000n → '1000.00'", () => expect(senToMyr(100000n)).toBe("1000.00"))
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @bomy/web test money.test.ts
```

Expected: FAIL — `senToMyr` is not defined.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/money.ts
/**
 * Convert sen (bigint) to a MYR amount string with 2 decimal places.
 * Used by the HitPay client (which takes a string amount).
 */
export function senToMyr(sen: bigint): string {
  if (sen < 0n) throw new Error(`senToMyr: negative amount ${sen}`)
  const major = sen / 100n
  const minor = sen % 100n
  return `${major}.${minor.toString().padStart(2, "0")}`
}
```

- [ ] **Step 4: Run tests until green**

```bash
pnpm --filter @bomy/web test money.test.ts
```

Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/money.ts apps/web/tests/lib/money.test.ts
git commit -m "feat(web): senToMyr helper (bigint sen → '0.00' string)"
```

---

## Task 6: Shipping address Zod schema

**Files:**

- Create: `apps/web/src/lib/shipping-address-schema.ts`
- Create: `apps/web/tests/lib/shipping-address-schema.test.ts`

- [ ] **Step 1: Write failing tests for the schema**

```ts
// apps/web/tests/lib/shipping-address-schema.test.ts
import { describe, expect, test } from "vitest"
import { ShippingAddressSchema, MY_STATES } from "@/lib/shipping-address-schema"

const valid = {
  name: "Aisha Tan",
  phone: "+60123456789",
  line1: "12, Jalan Manggis",
  city: "Petaling Jaya",
  postcode: "47301",
  state: "Selangor" as const,
  country: "MY" as const,
}

describe("ShippingAddressSchema", () => {
  test("accepts a valid MY address", () => {
    expect(() => ShippingAddressSchema.parse(valid)).not.toThrow()
  })
  test("rejects missing name", () => {
    expect(() => ShippingAddressSchema.parse({ ...valid, name: "" })).toThrow()
  })
  test("rejects non-MY phone format", () => {
    expect(() => ShippingAddressSchema.parse({ ...valid, phone: "+1 555 1234" })).toThrow()
  })
  test("accepts +60 prefix with 9 digits", () => {
    expect(() => ShippingAddressSchema.parse({ ...valid, phone: "+60123456789" })).not.toThrow()
  })
  test("rejects postcode of wrong length", () => {
    expect(() => ShippingAddressSchema.parse({ ...valid, postcode: "4730" })).toThrow()
    expect(() => ShippingAddressSchema.parse({ ...valid, postcode: "473011" })).toThrow()
  })
  test("rejects unknown state", () => {
    expect(() => ShippingAddressSchema.parse({ ...valid, state: "California" })).toThrow()
  })
  test("rejects non-MY country", () => {
    expect(() => ShippingAddressSchema.parse({ ...valid, country: "SG" })).toThrow()
  })
  test("MY_STATES contains 16 entries", () => {
    expect(MY_STATES).toHaveLength(16)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @bomy/web test shipping-address-schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/shipping-address-schema.ts
import { z } from "zod"

export const MY_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "Kuala Lumpur",
  "Labuan",
  "Putrajaya",
] as const

export const ShippingAddressSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+?60\d{8,10}$/, "Phone must be a Malaysian number (e.g. +60123456789)"),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(80),
  postcode: z.string().regex(/^\d{5}$/, "Postcode must be 5 digits"),
  state: z.enum(MY_STATES),
  country: z.literal("MY"),
})

export type ShippingAddressInput = z.infer<typeof ShippingAddressSchema>
```

- [ ] **Step 4: Tests green**

```bash
pnpm --filter @bomy/web test shipping-address-schema.test.ts
```

Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/shipping-address-schema.ts apps/web/tests/lib/shipping-address-schema.test.ts
git commit -m "feat(web): MY shipping address Zod schema"
```

---

## Task 7: Checkout errors module

**Files:**

- Create: `apps/web/src/lib/checkout-errors.ts`

- [ ] **Step 1: Implement (no test for pure type/data module)**

```ts
// apps/web/src/lib/checkout-errors.ts

export type CheckoutErrorCode =
  | "UNAUTHENTICATED"
  | "CHECKOUT_DISABLED"
  | "EMPTY_CART"
  | "INVALID_ADDRESS"
  | "PENDING_CHECKOUT_EXISTS"
  | "INVALID_CART"
  | "OUT_OF_STOCK_RACE"
  | "VOUCHER_UNAVAILABLE"
  | "VOUCHER_RACE"
  | "TOTAL_NOT_PAYABLE"
  | "PAYMENT_INIT_FAILED"

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode
  readonly details: Record<string, unknown>
  constructor(code: CheckoutErrorCode, details: Record<string, unknown> = {}) {
    super(code)
    this.code = code
    this.details = details
  }
}

export const CHECKOUT_USER_COPY: Record<CheckoutErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  CHECKOUT_DISABLED: "Checkout is temporarily unavailable.",
  EMPTY_CART: "Your cart is empty.",
  INVALID_ADDRESS: "Please check the shipping address.",
  PENDING_CHECKOUT_EXISTS:
    "You have a checkout in progress. Complete or cancel it before starting again.",
  INVALID_CART: "Some items in your cart are no longer available.",
  OUT_OF_STOCK_RACE: "Stock changed while you were reviewing — please refresh.",
  VOUCHER_UNAVAILABLE: "Voucher is no longer valid.",
  VOUCHER_RACE: "Voucher is no longer valid.",
  TOTAL_NOT_PAYABLE:
    "Voucher covers the full order; please remove it or add shipping/another item.",
  PAYMENT_INIT_FAILED: "Payment provider unavailable — please try again.",
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/checkout-errors.ts
git commit -m "feat(web): CheckoutError class + user-copy map"
```

---

## Task 8: Pure computation helpers

**Files:**

- Create: `apps/web/src/app/checkout/queries.ts`
- Create: `apps/web/tests/checkout/computeCheckoutTotals.test.ts`

Per spec §3.4, the totals computation is deterministic, integer sen, ASC by `store_id`, last-store-absorbs. Pure function — easiest to unit-test in isolation.

- [ ] **Step 1: Write the failing test for `computeCheckoutTotals`**

```ts
// apps/web/tests/checkout/computeCheckoutTotals.test.ts
import { describe, expect, test } from "vitest"
import { computeCheckoutTotals } from "@/app/checkout/queries"

const lineA = {
  variantId: "v1",
  storeId: "s1",
  quantity: 2,
  unitPriceSen: 1000n,
  productSnapshot: {},
  variantSnapshot: {},
}
const lineB = {
  variantId: "v2",
  storeId: "s2",
  quantity: 1,
  unitPriceSen: 5000n,
  productSnapshot: {},
  variantSnapshot: {},
}

describe("computeCheckoutTotals", () => {
  test("happy path: 2 stores, no discounts, flat shipping", () => {
    const r = computeCheckoutTotals({
      lines: [lineA, lineB],
      storeShipping: new Map([
        ["s1", 500n],
        ["s2", 1000n],
      ]),
      brandSubs: new Map(),
      voucher: null,
    })
    expect(r.totalCatalogSen).toBe(7000n) // 2000 + 5000
    expect(r.totalShippingSen).toBe(1500n) // 500 + 1000
    expect(r.voucherDiscountSen).toBe(0n)
    expect(r.brandDiscountTotalSen).toBe(0n)
    expect(r.totalBuyerPaysSen).toBe(8500n)
    expect(r.storeRows).toHaveLength(2)
    expect(r.storeRows[0].storeId).toBe("s1") // ASC order
    expect(r.itemRows).toHaveLength(2)
  })

  test("brand discount applies per-line (10% off, floor); voucher null", () => {
    const r = computeCheckoutTotals({
      lines: [lineA], // 2 * 1000 = 2000 sen
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map([["s1", 10]]),
      voucher: null,
    })
    expect(r.itemRows[0].brandDiscountSen).toBe(200n) // floor(2000 * 10/100)
    expect(r.storeRows[0].brandDiscountSen).toBe(200n)
    expect(r.storeRows[0].discountedSubtotalSen).toBe(1800n)
    expect(r.brandDiscountTotalSen).toBe(200n)
    expect(r.totalBuyerPaysSen).toBe(1800n)
  })

  test("voucher suppresses brand discount even if active brand sub exists", () => {
    const r = computeCheckoutTotals({
      lines: [lineA],
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map([["s1", 10]]),
      voucher: {
        type: "fixed_myr",
        fixedAmountSen: 500n,
        percentage: null,
        randomResolvedSen: null,
      },
    })
    expect(r.brandDiscountTotalSen).toBe(0n)
    expect(r.voucherDiscountSen).toBe(500n)
  })

  test("fixed_myr voucher capped at catalog total", () => {
    const r = computeCheckoutTotals({
      lines: [lineA],
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map(),
      voucher: {
        type: "fixed_myr",
        fixedAmountSen: 9999n,
        percentage: null,
        randomResolvedSen: null,
      },
    })
    expect(r.voucherDiscountSen).toBe(2000n) // capped
    expect(r.totalBuyerPaysSen).toBe(0n) // (will be guarded externally by TOTAL_NOT_PAYABLE)
  })

  test("random_myr uses random_resolved_sen, capped", () => {
    const r = computeCheckoutTotals({
      lines: [lineA],
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map(),
      voucher: {
        type: "random_myr",
        fixedAmountSen: null,
        percentage: null,
        randomResolvedSen: 1500n,
      },
    })
    expect(r.voucherDiscountSen).toBe(1500n)
  })

  test("percentage voucher: floor", () => {
    const r = computeCheckoutTotals({
      lines: [lineA], // 2000 sen catalog
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map(),
      voucher: {
        type: "percentage",
        fixedAmountSen: null,
        percentage: 15,
        randomResolvedSen: null,
      },
    })
    expect(r.voucherDiscountSen).toBe(300n) // floor(2000 * 15 / 100)
  })

  test("voucher allocation across multiple stores: proportional, last-store-absorbs", () => {
    // s1: 2000, s2: 5000, total = 7000. Voucher = 1000 sen.
    // Floor allocation: s1 = floor(2000 * 1000 / 7000) = 285; s2 = 1000 - 285 = 715.
    const r = computeCheckoutTotals({
      lines: [lineA, lineB],
      storeShipping: new Map([
        ["s1", 0n],
        ["s2", 0n],
      ]),
      brandSubs: new Map(),
      voucher: {
        type: "fixed_myr",
        fixedAmountSen: 1000n,
        percentage: null,
        randomResolvedSen: null,
      },
    })
    expect(r.storeRows[0].voucherContributionSen).toBe(285n)
    expect(r.storeRows[1].voucherContributionSen).toBe(715n)
    const sum = r.storeRows.reduce((a, s) => a + s.voucherContributionSen, 0n)
    expect(sum).toBe(r.voucherDiscountSen)
  })

  test("deterministic store order: ASC by storeId", () => {
    const r = computeCheckoutTotals({
      lines: [
        { ...lineB, storeId: "zzz" },
        { ...lineA, storeId: "aaa" },
      ],
      storeShipping: new Map([
        ["aaa", 0n],
        ["zzz", 0n],
      ]),
      brandSubs: new Map(),
      voucher: null,
    })
    expect(r.storeRows[0].storeId).toBe("aaa")
    expect(r.storeRows[1].storeId).toBe("zzz")
  })

  test("empty lines → throws (caller's job to guard)", () => {
    expect(() =>
      computeCheckoutTotals({
        lines: [],
        storeShipping: new Map(),
        brandSubs: new Map(),
        voucher: null,
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm --filter @bomy/web test computeCheckoutTotals.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `computeCheckoutTotals` in `queries.ts`**

```ts
// apps/web/src/app/checkout/queries.ts
/**
 * Pure totals computation for checkout. Deterministic, integer sen,
 * ASC store_id, last-store-absorbs. No DB access — see fetchCheckoutContext
 * below for the DB layer.
 */

export type VoucherInput = {
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedAmountSen: bigint | null
  percentage: number | null // smallint in DB
  randomResolvedSen: bigint | null
}

export type CheckoutLine = {
  variantId: string
  storeId: string
  quantity: number
  unitPriceSen: bigint
  productSnapshot: unknown
  variantSnapshot: unknown
}

export type CheckoutTotals = {
  totalCatalogSen: bigint
  totalShippingSen: bigint
  voucherDiscountSen: bigint
  brandDiscountTotalSen: bigint
  totalBuyerPaysSen: bigint
  itemRows: Array<CheckoutLine & { lineTotalSen: bigint; brandDiscountSen: bigint }>
  storeRows: Array<{
    storeId: string
    retailSubtotalSen: bigint
    brandDiscountSen: bigint
    discountedSubtotalSen: bigint
    voucherContributionSen: bigint
    shippingFeeSen: bigint
  }>
}

export function computeCheckoutTotals(input: {
  lines: CheckoutLine[]
  storeShipping: Map<string, bigint> // storeId -> flat shipping fee
  brandSubs: Map<string, number> // storeId -> discount_pct (only when voucher null)
  voucher: VoucherInput | null
}): CheckoutTotals {
  if (input.lines.length === 0) throw new Error("computeCheckoutTotals: empty lines")

  const voucherSuppressesBrand = input.voucher !== null
  const effectiveBrandSubs = voucherSuppressesBrand ? new Map<string, number>() : input.brandSubs

  // Per-line: line_total + brand_discount
  const itemRows = input.lines.map((l) => {
    const lineTotalSen = l.unitPriceSen * BigInt(l.quantity)
    const pct = effectiveBrandSubs.get(l.storeId)
    const brandDiscountSen = pct ? (lineTotalSen * BigInt(pct)) / 100n : 0n
    return { ...l, lineTotalSen, brandDiscountSen }
  })

  // Group by store, ASC store_id
  const distinctStoreIds = [...new Set(itemRows.map((r) => r.storeId))].sort()
  const storeRowsPre = distinctStoreIds.map((storeId) => {
    const lines = itemRows.filter((r) => r.storeId === storeId)
    const retailSubtotalSen = lines.reduce((a, l) => a + l.lineTotalSen, 0n)
    const brandDiscountSen = lines.reduce((a, l) => a + l.brandDiscountSen, 0n)
    const discountedSubtotalSen = retailSubtotalSen - brandDiscountSen
    const shippingFeeSen = input.storeShipping.get(storeId) ?? 0n
    return { storeId, retailSubtotalSen, brandDiscountSen, discountedSubtotalSen, shippingFeeSen }
  })

  const totalCatalogSen = storeRowsPre.reduce((a, s) => a + s.retailSubtotalSen, 0n)
  const totalShippingSen = storeRowsPre.reduce((a, s) => a + s.shippingFeeSen, 0n)
  const brandDiscountTotalSen = storeRowsPre.reduce((a, s) => a + s.brandDiscountSen, 0n)

  // Voucher value (catalog-only, capped)
  let voucherDiscountSen = 0n
  if (input.voucher) {
    const v = input.voucher
    let raw: bigint = 0n
    if (v.type === "fixed_myr" && v.fixedAmountSen !== null) raw = v.fixedAmountSen
    if (v.type === "random_myr" && v.randomResolvedSen !== null) raw = v.randomResolvedSen
    if (v.type === "percentage" && v.percentage !== null)
      raw = (totalCatalogSen * BigInt(v.percentage)) / 100n
    voucherDiscountSen = raw < totalCatalogSen ? raw : totalCatalogSen
  }

  // Per-store voucher allocation: proportional, last-store-absorbs remainder
  let runningAllocated = 0n
  const storeRows = storeRowsPre.map((s, idx) => {
    let voucherContributionSen: bigint
    if (voucherDiscountSen === 0n) {
      voucherContributionSen = 0n
    } else if (idx === storeRowsPre.length - 1) {
      voucherContributionSen = voucherDiscountSen - runningAllocated
    } else {
      voucherContributionSen = (s.retailSubtotalSen * voucherDiscountSen) / totalCatalogSen
      runningAllocated += voucherContributionSen
    }
    return { ...s, voucherContributionSen }
  })

  const totalBuyerPaysSen =
    totalCatalogSen + totalShippingSen - voucherDiscountSen - brandDiscountTotalSen

  return {
    totalCatalogSen,
    totalShippingSen,
    voucherDiscountSen,
    brandDiscountTotalSen,
    totalBuyerPaysSen,
    itemRows,
    storeRows,
  }
}
```

- [ ] **Step 4: Run until all 9 tests pass**

```bash
pnpm --filter @bomy/web test computeCheckoutTotals.test.ts
```

Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/checkout/queries.ts apps/web/tests/checkout/computeCheckoutTotals.test.ts
git commit -m "feat(web): pure computeCheckoutTotals helper (sen, deterministic, last-store-absorbs)"
```

---

## Task 9: `priceCheckoutPreview` server action

**Files:**

- Modify: `apps/web/src/app/checkout/queries.ts` — add `fetchCheckoutContext` + `priceCheckoutPreview`
- Create: `apps/web/src/app/checkout/actions.ts` — re-export the action
- Create: `apps/web/tests/checkout/preview.test.ts`

- [ ] **Step 1: Write integration test for preview**

Mirror tests 28–39 from spec §6.3 (preview math). Each test seeds a buyer + store + variants, optionally a voucher and/or brand subscription, calls `priceCheckoutPreview({ items, voucherId })` under the buyer's session, and asserts the returned totals.

```ts
// apps/web/tests/checkout/preview.test.ts (skeleton)
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { setupTestDb, type TestDb } from "@/test-helpers" // adapt path to your repo's helper
import { priceCheckoutPreview } from "@/app/checkout/actions"

describe("priceCheckoutPreview", () => {
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

  test("ignores client-supplied totals; computes from DB", async () => {
    /* ... */
  })
  test("brand discount applies when buyer has active sub; uses snapshotted discount_pct", async () => {
    /* ... */
  })
  test("brand discount = 0 when voucher selected", async () => {
    /* ... */
  })
  test("brand discount = 0 when sub status = pending", async () => {
    /* ... */
  })
  test("brand discount = 0 when sub status = cancelled", async () => {
    /* ... */
  })
  test("brand discount = 0 when period_end < now()", async () => {
    /* ... */
  })
  test("voucher fixed_myr capped at catalog total", async () => {
    /* ... */
  })
  test("voucher random_myr uses random_resolved_sen, capped", async () => {
    /* ... */
  })
  test("voucher percentage: floor", async () => {
    /* ... */
  })
  test("per-store voucher allocation: proportional, last-store-absorbs", async () => {
    /* ... */
  })
  test("multi-store cart: shipping summed; brand discount per-matching-store", async () => {
    /* ... */
  })
  test("preview against another buyer's voucher: not returned in dropdown, not applied", async () => {
    /* ... */
  })
  test("returns invalidLines when a variant is archived", async () => {
    /* ... */
  })
  test("returns invalidLines when a store is suspended", async () => {
    /* ... */
  })
})
```

- [ ] **Step 2: Run, expect failures (preview not implemented)**

- [ ] **Step 3: Implement `fetchCheckoutContext` (DB reads under `withTenant`)**

Append to `apps/web/src/app/checkout/queries.ts`:

```ts
import { and, eq, gt, inArray, isNull } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { brandSubscriptions, products, productVariants, stores, vouchers } from "@bomy/db/schema"
import { withTenant } from "@bomy/db"
import type { Database } from "@bomy/db"

export type CheckoutContext = {
  validLines: Array<{
    variantId: string
    storeId: string
    quantity: number
    unitPriceSen: bigint
    productSnapshot: unknown
    variantSnapshot: unknown
  }>
  invalidLines: Array<{
    variantId: string
    reason:
      | "missing"
      | "variant_inactive"
      | "product_not_active"
      | "store_not_active"
      | "insufficient_stock"
  }>
  storeShipping: Map<string, bigint> // storeId -> flat_shipping_fee_sen
  brandSubs: Map<string, number> // storeId -> discount_pct (snapshotted)
  voucher: VoucherInput | null
}

export async function fetchCheckoutContext(input: {
  db: Database
  buyerId: string
  items: Array<{ variantId: string; quantity: number }>
  voucherId: string | null
}): Promise<CheckoutContext> {
  return withTenant(input.db, { userId: input.buyerId, userRole: "buyer" }, async (tx) => {
    // 1. Variants joined with products + stores
    const variantIds = input.items.map((i) => i.variantId)
    const rows = await tx
      .select({
        variantId: productVariants.id,
        variantActive: productVariants.isActive,
        unitPriceSen: productVariants.priceMyrSen,
        stockCount: productVariants.stockCount,
        productId: products.id,
        productStatus: products.status,
        productName: products.name,
        productSnapshot: sql<unknown>`row_to_json(${products}.*)`.as("product_snapshot"),
        variantSnapshot: sql<unknown>`row_to_json(${productVariants}.*)`.as("variant_snapshot"),
        storeId: stores.id,
        storeStatus: stores.status,
        flatShippingFeeSen: stores.flatShippingFeeSen,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(inArray(productVariants.id, variantIds))

    const byVariant = new Map(rows.map((r) => [r.variantId, r]))

    const validLines: CheckoutContext["validLines"] = []
    const invalidLines: CheckoutContext["invalidLines"] = []
    const storeShipping = new Map<string, bigint>()

    for (const { variantId, quantity } of input.items) {
      const r = byVariant.get(variantId)
      if (!r) {
        invalidLines.push({ variantId, reason: "missing" })
        continue
      }
      if (!r.variantActive) {
        invalidLines.push({ variantId, reason: "variant_inactive" })
        continue
      }
      if (r.productStatus !== "active") {
        invalidLines.push({ variantId, reason: "product_not_active" })
        continue
      }
      if (r.storeStatus !== "active") {
        invalidLines.push({ variantId, reason: "store_not_active" })
        continue
      }
      if (r.stockCount < quantity) {
        invalidLines.push({ variantId, reason: "insufficient_stock" })
        continue
      }
      validLines.push({
        variantId,
        storeId: r.storeId,
        quantity,
        unitPriceSen: r.unitPriceSen,
        productSnapshot: r.productSnapshot,
        variantSnapshot: r.variantSnapshot,
      })
      storeShipping.set(r.storeId, r.flatShippingFeeSen)
    }

    // 2. Voucher (only if id is provided AND available AND owned)
    let voucher: VoucherInput | null = null
    if (input.voucherId) {
      const vRows = await tx
        .select()
        .from(vouchers)
        .where(
          and(
            eq(vouchers.id, input.voucherId),
            eq(vouchers.userId, input.buyerId),
            isNull(vouchers.redeemedAt),
            isNull(vouchers.reservedCheckoutSessionId),
            gt(vouchers.expiresAt, sql`now()`),
          ),
        )
        .limit(1)
      if (vRows.length === 1) {
        const v = vRows[0]!
        voucher = {
          type: v.type,
          fixedAmountSen: v.fixedAmountSen,
          percentage: v.percentage,
          randomResolvedSen: v.randomResolvedSen,
        }
      }
    }

    // 3. Brand subs (only if no voucher)
    const brandSubs = new Map<string, number>()
    if (!voucher && validLines.length > 0) {
      const distinctStoreIds = [...new Set(validLines.map((l) => l.storeId))]
      const subs = await tx
        .select({
          storeId: brandSubscriptions.storeId,
          discountPct: brandSubscriptions.discountPct,
        })
        .from(brandSubscriptions)
        .where(
          and(
            eq(brandSubscriptions.userId, input.buyerId),
            inArray(brandSubscriptions.storeId, distinctStoreIds),
            eq(brandSubscriptions.status, "active"),
            gt(brandSubscriptions.periodEnd, sql`now()`),
          ),
        )
      for (const s of subs) brandSubs.set(s.storeId, s.discountPct)
    }

    return { validLines, invalidLines, storeShipping, brandSubs, voucher }
  })
}
```

- [ ] **Step 4: Implement `priceCheckoutPreview` server action**

```ts
// apps/web/src/app/checkout/actions.ts
"use server"

import { db } from "@bomy/db"
import { getServerSession } from "@/lib/auth" // adapt to existing helper
import { fetchCheckoutContext, computeCheckoutTotals } from "./queries"
import { CheckoutError } from "@/lib/checkout-errors"

export type PreviewResult =
  | {
      ok: true
      invalidLines: Array<{ variantId: string; reason: string }>
      itemRows: Array<{
        variantId: string
        storeId: string
        quantity: number
        lineTotalSen: string
        brandDiscountSen: string
      }>
      storeRows: Array<{
        storeId: string
        retailSubtotalSen: string
        brandDiscountSen: string
        voucherContributionSen: string
        shippingFeeSen: string
        discountedSubtotalSen: string
      }>
      totalCatalogSen: string
      totalShippingSen: string
      voucherDiscountSen: string
      brandDiscountTotalSen: string
      totalBuyerPaysSen: string
      availableVouchers: Array<{ id: string; type: string; label: string }>
    }
  | {
      ok: false
      error: "INVALID_CART" | "TOTAL_NOT_PAYABLE"
      invalidLines: Array<{ variantId: string; reason: InvalidLineReason }> // present so the UI can render the banner
      availableVouchers: Array<{ id: string; type: string; label: string }>
    }
  | { ok: false; error: "UNAUTHENTICATED" | "EMPTY_CART" }

export type InvalidLineReason =
  | "missing"
  | "variant_inactive"
  | "product_not_active"
  | "store_not_active"
  | "insufficient_stock"

export async function priceCheckoutPreview(input: {
  items: Array<{ variantId: string; quantity: number }>
  voucherId: string | null
}): Promise<PreviewResult> {
  const session = await getServerSession()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" }
  if (input.items.length === 0) return { ok: false, error: "EMPTY_CART" }

  const ctx = await fetchCheckoutContext({
    db,
    buyerId: session.user.id,
    items: input.items,
    voucherId: input.voucherId,
  })

  const availableVouchers = await loadAvailableVouchers(db, session.user.id)

  if (ctx.invalidLines.length > 0) {
    // UI shows the invalid-line banner from this payload; pay button stays disabled.
    return { ok: false, error: "INVALID_CART", invalidLines: ctx.invalidLines, availableVouchers }
  }

  const totals = computeCheckoutTotals({
    lines: ctx.validLines,
    storeShipping: ctx.storeShipping,
    brandSubs: ctx.brandSubs,
    voucher: ctx.voucher,
  })

  if (totals.totalBuyerPaysSen <= 0n) {
    return { ok: false, error: "TOTAL_NOT_PAYABLE", invalidLines: [], availableVouchers }
  }

  return {
    ok: true,
    invalidLines: [],
    itemRows: totals.itemRows.map(serializeBigints),
    storeRows: totals.storeRows.map(serializeBigints),
    ...allTotalsAsStrings(totals),
    availableVouchers,
  }
}
```

**UI behaviour:** the `/checkout` client form treats `INVALID_CART` and `TOTAL_NOT_PAYABLE` like `ok: true` from a rendering standpoint — it renders the invalid-line banner from `invalidLines`, the voucher dropdown from `availableVouchers`, and disables the Pay button. Only `UNAUTHENTICATED` and `EMPTY_CART` short-circuit to a different page state. Per spec §4.2 invalid-line banner copy.

`loadAvailableVouchers` reads `vouchers` under `withTenant`-buyer (own + unredeemed + unreserved + unexpired) and formats labels per spec §4.2 (no `voucher.code` exposed).

`serializeBigints` and `allTotalsAsStrings` convert bigints to strings (React Server Components can serialize plain strings; bigint isn't directly JSON-safe).

- [ ] **Step 5: Run preview tests until green**

Fill in each test body using the harness. Iterate until all pass.

```bash
pnpm --filter @bomy/web test preview.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/checkout/queries.ts apps/web/src/app/checkout/actions.ts apps/web/tests/checkout/preview.test.ts
git commit -m "feat(web): priceCheckoutPreview server action + integration tests"
```

---

## Task 10: `compensateInitiation` helper

**Files:**

- Create: `apps/web/src/app/checkout/compensate.ts`
- (Tests fold into Task 11/12 since compensation is exercised via the initiation paths.)

- [ ] **Step 1: Implement**

```ts
// apps/web/src/app/checkout/compensate.ts
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@bomy/db"
import {
  checkoutSessions,
  inventoryReservations,
  productVariants,
  vouchers,
  withAdmin,
} from "@bomy/db"

/**
 * Idempotent, ownership-guarded compensation. Called from:
 *   1. initiateCheckout when HitPay createPaymentRequest throws
 *   2. initiateCheckout when PSP-ref persistence returns 0 rows or throws
 *   3. cancelPendingCheckout when buyer hits /checkout/cancelled
 *
 * Locks the checkout_sessions row first (per spec §5.1 existing-session
 * lock order); if status != 'pending_payment' or user_id != buyerId,
 * returns a no-op.
 */
export async function compensateInitiation(
  sessionId: string,
  buyerId: string,
  reason: string,
): Promise<void> {
  await withAdmin(
    db,
    { userId: buyerId, reason: `checkout_compensation:${reason}:${sessionId}` },
    async (tx) => {
      // 1. Lock and verify session
      const lockedSessions = await tx
        .select({ id: checkoutSessions.id })
        .from(checkoutSessions)
        .where(
          and(
            eq(checkoutSessions.id, sessionId),
            eq(checkoutSessions.userId, buyerId),
            eq(checkoutSessions.status, "pending_payment"),
          ),
        )
        .for("update")
        .limit(1)
      if (lockedSessions.length === 0) return // no-op: paid race, wrong owner, or already-cancelled

      // 2. Release reservations (active -> released)
      const released = await tx
        .update(inventoryReservations)
        .set({ status: "released", updatedAt: sql`now()` })
        .where(
          and(
            eq(inventoryReservations.checkoutSessionId, sessionId),
            eq(inventoryReservations.status, "active"),
          ),
        )
        .returning({
          variantId: inventoryReservations.variantId,
          quantity: inventoryReservations.quantity,
        })

      // 3. Restore stock
      for (const r of released) {
        await tx
          .update(productVariants)
          .set({ stockCount: sql`stock_count + ${r.quantity}`, updatedAt: sql`now()` })
          .where(eq(productVariants.id, r.variantId))
      }

      // 4. Release voucher (ownership-guarded)
      await tx
        .update(vouchers)
        .set({ reservedCheckoutSessionId: null, reservedAt: null })
        .where(
          and(
            eq(vouchers.reservedCheckoutSessionId, sessionId),
            isNull(vouchers.redeemedAt),
            eq(vouchers.userId, buyerId),
          ),
        )

      // 5. Mark session cancelled (guarded again)
      await tx
        .update(checkoutSessions)
        .set({ status: "cancelled", updatedAt: sql`now()` })
        .where(
          and(
            eq(checkoutSessions.id, sessionId),
            eq(checkoutSessions.userId, buyerId),
            eq(checkoutSessions.status, "pending_payment"),
          ),
        )
    },
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/checkout/compensate.ts
git commit -m "feat(web): compensateInitiation — idempotent, ownership-guarded checkout rollback"
```

---

## Task 11: `initiateCheckout` Phase 1

**Files:**

- Modify: `apps/web/src/app/checkout/actions.ts` — add `initiateCheckout`
- Create: `apps/web/tests/checkout/initiate.test.ts`

This task implements Phase 1 (single `withAdmin` transaction) only. Phase 1b lands in Task 12.

- [ ] **Step 1: Write failing tests for Phase 1 paths**

Mirror tests 14-25 from spec §6.2 — but defer 26 and 27 (HitPay failure paths) to Task 12.

```ts
// apps/web/tests/checkout/initiate.test.ts (skeleton)
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { setupTestDb, type TestDb } from "@/test-helpers"
import { initiateCheckout } from "@/app/checkout/actions"

// Stub the HitPay client to ALWAYS succeed in Task 11 tests; Task 12 tests
// override the stub per-case.
vi.mock("@bomy/hitpay", () => ({
  hitpayClient: () => ({
    createPaymentRequest: vi.fn().mockResolvedValue({
      id: "hp_request_1",
      url: "https://hitpay.test/redirect",
    }),
  }),
  verifyWebhookSignature: vi.fn(),
}))

describe("initiateCheckout Phase 1", () => {
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

  test("checkout_enabled = false returns CHECKOUT_DISABLED; no side effects", async () => {
    /* assert table counts before/after */
  })
  test("empty cart returns EMPTY_CART", async () => {
    /* ... */
  })
  test("happy path: writes session, items, stores, reservations; decrements stock; reserves voucher; calls HitPay; writes audit row", async () => {
    /* ... */
  })
  test("INVALID_CART when variant inactive", async () => {
    /* ... */
  })
  test("INVALID_CART when product archived", async () => {
    /* ... */
  })
  test("INVALID_CART when store suspended", async () => {
    /* ... */
  })
  test("INVALID_CART when stock < requested", async () => {
    /* ... */
  })
  test("INVALID_ADDRESS rejects bad MY phone format", async () => {
    /* ... */
  })
  test("PENDING_CHECKOUT_EXISTS returns existing sessionId when buyer has pending session", async () => {
    /* ... */
  })
  test("TOTAL_NOT_PAYABLE when voucher covers full catalog + zero shipping", async () => {
    /* ... */
  })
  test("stock race: two *different* buyers initiating concurrently for the last unit → one wins, other OUT_OF_STOCK_RACE; stock ends at 0", async () => {
    /* Two buyers (single-pending applies per-buyer, advisory lock keyed on buyer.id, so different buyers don't block each other).
       Both have add-to-cart for the same variant with stock_count = 1.
       Run both initiateCheckout calls concurrently with Promise.all.
       Assertions: exactly one returns { ok: true }; the other returns { ok: false, error: "OUT_OF_STOCK_RACE" }.
       Stock is 0 afterwards. Exactly one checkout_session in pending_payment with PSP id set. */
  })

  test("voucher reservation race (seam-level): two concurrent transactions UPDATE the same voucher row — only one succeeds", async () => {
    /* The full initiateCheckout single-pending lock makes a same-buyer voucher race
       unreachable via the public API (second call hits PENDING_CHECKOUT_EXISTS;
       vouchers are user-scoped so two buyers can't share one). To verify the atomic
       guard at the reservation UPDATE level, exercise it directly:

       1. Seed a voucher owned by buyer B with redeemed_at=NULL, reserved_*=NULL.
       2. Seed two ephemeral checkout_sessions s1, s2 owned by B (status='pending_payment')
          via direct withAdmin INSERT — these bypass single-pending which is only
          enforced inside initiateCheckout.
       3. In two concurrent withAdmin transactions, run:
            UPDATE vouchers
               SET reserved_checkout_session_id = $sX, reserved_at = now()
             WHERE id = $voucherId
               AND redeemed_at IS NULL
               AND reserved_checkout_session_id IS NULL
               AND expires_at > now()
            RETURNING id
       4. Promise.all both transactions.
       5. Assert exactly one returns one row; the other returns zero rows.
       6. Assert vouchers.reserved_checkout_session_id is now one of s1/s2 (not null, not both).

       This validates the WHERE-clause-as-lock guarantee. */
  })

  test("voucher race (end-to-end, single-pending interaction): same-buyer second call returns PENDING_CHECKOUT_EXISTS, not VOUCHER_RACE", async () => {
    /* Document the interaction: single-pending enforcement prevents same-buyer
       voucher races from surfacing as VOUCHER_RACE. Run initiateCheckout once
       successfully; run again with same voucher — assert PENDING_CHECKOUT_EXISTS
       (not VOUCHER_RACE). This is intentional: VOUCHER_RACE is reachable only via
       the seam-level path above. */
  })
})
```

For the happy-path test, before calling `initiateCheckout` set `checkout_enabled = true` via a direct `withAdmin` write (this is the only place tests bypass the production gate). For the disabled test, leave it `false`.

- [ ] **Step 2: Run to confirm all fail**

- [ ] **Step 3: Implement `initiateCheckout` (Phase 1 only — HitPay call returns a static stub for now)**

```ts
// apps/web/src/app/checkout/actions.ts (append)
import { randomUUID } from "crypto"
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import {
  checkoutSessions,
  checkoutSessionItems,
  checkoutSessionStores,
  inventoryReservations,
  productVariants,
  vouchers,
  withAdmin,
} from "@bomy/db"
import { ShippingAddressSchema, type ShippingAddressInput } from "@/lib/shipping-address-schema"
import { CheckoutError, type CheckoutErrorCode } from "@/lib/checkout-errors"
import { readPlatformConfig } from "@bomy/db/platform-config" // see helper definition below
import { fetchCheckoutContext, computeCheckoutTotals } from "./queries"
import { hitpayClient } from "@bomy/hitpay"
import { senToMyr } from "@/lib/money"

export async function initiateCheckout(input: {
  items: Array<{ variantId: string; quantity: number }>
  voucherId: string | null
  shippingAddress: ShippingAddressInput
}): Promise<
  | { ok: true; redirectUrl: string }
  | { ok: false; error: CheckoutErrorCode; details?: Record<string, unknown> }
> {
  const session = await getServerSession()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" }

  const enabled = await readPlatformConfig<boolean>(db, "checkout_enabled", {
    actorUserId: session.user.id,
    reason: "checkout_enabled gate check",
  })
  if (enabled !== true) return { ok: false, error: "CHECKOUT_DISABLED" }

  if (input.items.length === 0) return { ok: false, error: "EMPTY_CART" }

  const parsed = ShippingAddressSchema.safeParse(input.shippingAddress)
  if (!parsed.success)
    return { ok: false, error: "INVALID_ADDRESS", details: parsed.error.flatten() }

  const sessionId = randomUUID()

  let phase1: { sessionId: string; totalBuyerPaysSen: bigint }
  try {
    phase1 = await withAdmin(
      db,
      { userId: session.user.id, reason: `checkout_initiation:${sessionId}` },
      async (tx) => {
        // 0. Advisory lock per buyer
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('checkout:' || ${session.user.id}::text))`,
        )

        // 1. Single-pending enforcement
        const existing = await tx
          .select({ id: checkoutSessions.id })
          .from(checkoutSessions)
          .where(
            and(
              eq(checkoutSessions.userId, session.user.id),
              eq(checkoutSessions.status, "pending_payment"),
              gt(checkoutSessions.expiresAt, sql`now()`),
            ),
          )
          .limit(1)
        if (existing.length > 0) {
          throw new CheckoutError("PENDING_CHECKOUT_EXISTS", { sessionId: existing[0].id })
        }

        // 2. Validate via fetchCheckoutContext  (re-runs read under withAdmin since RLS is bypassed)
        //    Use a separate path that reads with FOR UPDATE on product_variants and FOR UPDATE on the voucher row.
        const ctx = await loadContextForInitiation(
          tx,
          session.user.id,
          input.items,
          input.voucherId,
        )
        if (ctx.invalidLines.length > 0) {
          throw new CheckoutError("INVALID_CART", { invalidLines: ctx.invalidLines })
        }

        // 3. Compute
        const totals = computeCheckoutTotals(ctx)

        // 4. Pre-insert payable guard
        if (totals.totalBuyerPaysSen <= 0n) throw new CheckoutError("TOTAL_NOT_PAYABLE")

        // 5. Insert checkout_sessions
        await tx.insert(checkoutSessions).values({
          id: sessionId,
          userId: session.user.id,
          status: "pending_payment",
          pspProvider: "hitpay",
          shippingAddress: parsed.data,
          voucherId: ctx.voucher ? input.voucherId : null,
          totalCatalogSen: totals.totalCatalogSen,
          totalShippingSen: totals.totalShippingSen,
          voucherDiscountSen: totals.voucherDiscountSen,
          brandDiscountTotalSen: totals.brandDiscountTotalSen,
          totalBuyerPaysSen: totals.totalBuyerPaysSen,
          expiresAt: sql`now() + interval '30 minutes'`,
        })

        // 6. Insert checkout_session_items
        await tx.insert(checkoutSessionItems).values(
          totals.itemRows.map((r) => ({
            checkoutSessionId: sessionId,
            storeId: r.storeId,
            variantId: r.variantId,
            productSnapshot: r.productSnapshot,
            variantSnapshot: r.variantSnapshot,
            quantity: r.quantity,
            unitPriceSen: r.unitPriceSen,
            lineTotalSen: r.lineTotalSen,
            brandDiscountSen: r.brandDiscountSen,
          })),
        )

        // 7. Insert checkout_session_stores
        await tx.insert(checkoutSessionStores).values(
          totals.storeRows.map((s) => ({
            checkoutSessionId: sessionId,
            storeId: s.storeId,
            retailSubtotalSen: s.retailSubtotalSen,
            brandDiscountSen: s.brandDiscountSen,
            discountedSubtotalSen: s.discountedSubtotalSen,
            voucherContributionSen: s.voucherContributionSen,
            shippingFeeSen: s.shippingFeeSen,
          })),
        )

        // 8. Atomic stock decrement per variant
        for (const line of totals.itemRows) {
          const r = await tx
            .update(productVariants)
            .set({ stockCount: sql`stock_count - ${line.quantity}`, updatedAt: sql`now()` })
            .where(
              and(eq(productVariants.id, line.variantId), sql`stock_count >= ${line.quantity}`),
            )
            .returning({ id: productVariants.id })
          if (r.length === 0)
            throw new CheckoutError("OUT_OF_STOCK_RACE", { variantId: line.variantId })
        }

        // 9. Insert inventory_reservations
        await tx.insert(inventoryReservations).values(
          totals.itemRows.map((line) => ({
            variantId: line.variantId,
            checkoutSessionId: sessionId,
            quantity: line.quantity,
            expiresAt: sql`now() + interval '30 minutes'`,
          })),
        )

        // 10. Reserve voucher (if any)
        if (ctx.voucher) {
          const r = await tx
            .update(vouchers)
            .set({ reservedCheckoutSessionId: sessionId, reservedAt: sql`now()` })
            .where(
              and(
                eq(vouchers.id, input.voucherId!),
                isNull(vouchers.redeemedAt),
                isNull(vouchers.reservedCheckoutSessionId),
                gt(vouchers.expiresAt, sql`now()`),
              ),
            )
            .returning({ id: vouchers.id })
          if (r.length === 0) throw new CheckoutError("VOUCHER_RACE")
        }

        return { sessionId, totalBuyerPaysSen: totals.totalBuyerPaysSen }
      },
    )
  } catch (err) {
    if (err instanceof CheckoutError) return { ok: false, error: err.code, details: err.details }
    throw err
  }

  // Phase 1b lands in Task 12. For now, return a placeholder.
  return { ok: true, redirectUrl: "/checkout/success?session=" + phase1.sessionId }
}
```

Helper `loadContextForInitiation` is a near-clone of `fetchCheckoutContext` that runs **inside** the existing transaction (no `withTenant` wrapper) and adds `.for("update")` on `product_variants` and `vouchers` rows. Place it next to `fetchCheckoutContext` in `queries.ts`.

`readPlatformConfig` helper — `platform_config` is staff-only at the RLS layer. Raw `db.select(...)` returns 0 rows under buyer context. Use `withAdmin` with the real session user (or `SYSTEM_ACTOR` if no user), matching the existing pattern in `apps/web/src/app/(marketing)/membership/page.tsx:13-27` and `membership/actions.ts:60-72`. The audit-row cost per config read is the accepted convention.

```ts
// packages/db/src/platform-config.ts
import { eq } from "drizzle-orm"
import type { Database } from "./client.js"
import { withAdmin } from "./tenant.js"
import { platformConfig } from "./schema/platform_config.js"
import { SYSTEM_ACTOR } from "./constants.js" // existing constant from PR #26

export async function readPlatformConfig<T>(
  db: Database,
  key: string,
  opts: { actorUserId?: string; reason: string },
): Promise<T | null> {
  return withAdmin(
    db,
    { userId: opts.actorUserId ?? SYSTEM_ACTOR, reason: opts.reason },
    async (tx) => {
      const rows = await tx
        .select({ value: platformConfig.value })
        .from(platformConfig)
        .where(eq(platformConfig.key, key))
        .limit(1)
      return rows.length === 1 ? (rows[0]!.value as T) : null
    },
  )
}
```

Update call sites accordingly:

- Inside `initiateCheckout` (this task): `const enabled = await readPlatformConfig<boolean>(db, "checkout_enabled", { actorUserId: session.user.id, reason: "checkout_enabled gate check (initiateCheckout)" })`
- Inside `/checkout` server shell (Task 15): `const enabled = await readPlatformConfig<boolean>(db, "checkout_enabled", { actorUserId: session.user.id, reason: "checkout_enabled gate check (/checkout render)" })`

Test impact: tests asserting "CHECKOUT_DISABLED, no side effects" should now also verify that **only the readPlatformConfig audit row is written** (no checkout_session, no items, no reservations, no compensation). The audit row from the gate-read is expected.

- [ ] **Step 4: Run tests until green**

```bash
pnpm --filter @bomy/web test initiate.test.ts
```

Expected: PASS for Phase 1 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/checkout/actions.ts apps/web/src/app/checkout/queries.ts packages/db/src/platform-config.ts apps/web/tests/checkout/initiate.test.ts
git commit -m "feat(web): initiateCheckout Phase 1 — single withAdmin transaction with stock/voucher reservation"
```

---

## Task 12: `initiateCheckout` Phase 1b (HitPay) + compensation triggers

**Files:**

- Modify: `apps/web/src/app/checkout/actions.ts` — wire Phase 1b
- Modify: `apps/web/tests/checkout/initiate.test.ts` — add tests 26, 27 from spec §6.2

- [ ] **Step 1: Add failing tests for HitPay failure paths**

```ts
// inside initiate.test.ts
describe("initiateCheckout Phase 1b", () => {
  test("HitPay createPaymentRequest throws → compensation runs; session=cancelled; reservations=released; stock restored; voucher released", async () => {
    /* override stub to throw */
  })
  test("PSP ref persistence returns 0 rows → compensation runs; PAYMENT_INIT_FAILED returned", async () => {
    /* simulate by pre-cancelling the session between phase 1 and 1b — use a hook */
  })
})
```

For the 0-rows test, the simplest approach is to **intercept after Phase 1 commit and before Phase 1b** by patching the time — or, alternatively, force the `WHERE status = 'pending_payment'` to fail by manually flipping the session in another connection. A pragmatic test: stub the HitPay call to succeed but then have the test driver itself call `compensateInitiation` (simulating any async failure that flips the session to `cancelled`) right after Phase 1 — the next `priceCheckoutPreview`/UPDATE will return 0 rows.

- [ ] **Step 2: Replace the Phase 1b placeholder with the real HitPay + PSP-ref logic**

Replace the final `return { ok: true, redirectUrl: ... }` block with:

```ts
// Phase 1b — outside transaction
let paymentRequest: { id: string; url: string }
try {
  paymentRequest = await hitpayClient().createPaymentRequest({
    amount: senToMyr(phase1.totalBuyerPaysSen),
    currency: "MYR",
    reference_number: phase1.sessionId,
    redirect_url: `${process.env.WEB_BASE_URL}/checkout/success?session=${phase1.sessionId}`,
    cancel_url: `${process.env.WEB_BASE_URL}/checkout/cancelled?session=${phase1.sessionId}`,
    webhook: `${process.env.API_BASE_URL}/webhooks/hitpay`,
    name: `BOMY order #${phase1.sessionId.slice(0, 8)}`,
  })
} catch (err) {
  await compensateInitiation(
    phase1.sessionId,
    session.user.id,
    `hitpay_create_failed:${(err as Error).message ?? "unknown"}`,
  )
  return { ok: false, error: "PAYMENT_INIT_FAILED" }
}

// Phase 1b T2 — store PSP reference (row-count guarded)
try {
  const updated = await withAdmin(
    db,
    { userId: session.user.id, reason: `checkout_store_psp_ref:${phase1.sessionId}` },
    async (tx) =>
      tx
        .update(checkoutSessions)
        .set({
          pspPaymentRequestId: paymentRequest.id,
          pspPaymentUrl: paymentRequest.url,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(checkoutSessions.id, phase1.sessionId),
            eq(checkoutSessions.status, "pending_payment"),
          ),
        )
        .returning({ id: checkoutSessions.id }),
  )
  if (updated.length !== 1) {
    await compensateInitiation(phase1.sessionId, session.user.id, "store_psp_ref_zero_rows")
    return { ok: false, error: "PAYMENT_INIT_FAILED" }
  }
} catch (err) {
  await compensateInitiation(phase1.sessionId, session.user.id, "store_psp_ref_failed")
  return { ok: false, error: "PAYMENT_INIT_FAILED" }
}

return { ok: true, redirectUrl: paymentRequest.url }
```

Add the `compensateInitiation` import at the top.

- [ ] **Step 3: Run tests until green**

```bash
pnpm --filter @bomy/web test initiate.test.ts
```

Expected: PASS (13/13 Phase 1 + Phase 1b).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/checkout/actions.ts apps/web/tests/checkout/initiate.test.ts
git commit -m "feat(web): initiateCheckout Phase 1b — HitPay redirect + PSP ref row-count guard + compensation triggers"
```

---

## Task 13: `cancelPendingCheckout` + `getCheckoutSessionStatus`

**Files:**

- Modify: `apps/web/src/app/checkout/actions.ts`
- Create: `apps/web/tests/checkout/cancel.test.ts`

- [ ] **Step 1: Write failing tests for cancel/compensation**

Tests 40-42 from spec §6.4:

```ts
test("cancelPendingCheckout from buyer: session pending → cancelled; reservations released; stock restored; voucher released; idempotent", async () => {
  /* ... */
})
test("compensateInitiation no-op when session.status = 'paid'", async () => {
  /* ... */
})
test("compensateInitiation no-op when wrong buyerId", async () => {
  /* ... */
})
```

- [ ] **Step 2: Implement `cancelPendingCheckout` and `getCheckoutSessionStatus` in `actions.ts`**

```ts
export async function cancelPendingCheckout(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: "UNAUTHENTICATED" }> {
  const session = await getServerSession()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" }
  await compensateInitiation(sessionId, session.user.id, "buyer_cancelled")
  return { ok: true }
}

export async function getCheckoutSessionStatus(
  sessionId: string,
): Promise<{ status: string } | { error: "NOT_FOUND" | "UNAUTHENTICATED" }> {
  const session = await getServerSession()
  if (!session?.user?.id) return { error: "UNAUTHENTICATED" }
  const rows = await withTenant(db, { userId: session.user.id, userRole: "buyer" }, async (tx) =>
    tx
      .select({ status: checkoutSessions.status })
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId))
      .limit(1),
  )
  if (rows.length === 0) return { error: "NOT_FOUND" }
  return { status: rows[0].status }
}
```

- [ ] **Step 3: Run tests until green**

```bash
pnpm --filter @bomy/web test cancel.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/checkout/actions.ts apps/web/tests/checkout/cancel.test.ts
git commit -m "feat(web): cancelPendingCheckout + getCheckoutSessionStatus server actions"
```

---

## Task 14: `/cart` page update — Proceed-to-Checkout link

**Files:**

- Modify: `apps/web/src/app/cart/page.tsx`

- [ ] **Step 1: Edit the existing cart page**

Replace the existing footer line:

```tsx
<p className="mt-1 text-xs text-gray-400">Checkout coming soon.</p>
```

with:

```tsx
<Link
  href="/checkout"
  className="mt-3 block w-full rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-700"
>
  Proceed to Checkout
</Link>
<p className="mt-2 text-xs text-gray-400">
  Final prices, shipping, discounts, and stock are confirmed at checkout.
</p>
```

- [ ] **Step 2: Verify in dev**

```bash
pnpm --filter @bomy/web dev
```

Open `http://localhost:3000/cart`, add an item from `/products`, confirm "Proceed to Checkout" appears and links correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/cart/page.tsx
git commit -m "feat(web): /cart — Proceed to Checkout link + footnote"
```

---

## Task 15: `/checkout` server component shell

**Files:**

- Create: `apps/web/src/app/checkout/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/app/checkout/page.tsx
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { readPlatformConfig } from "@bomy/db/platform-config"
import { CheckoutForm } from "./checkout-form"

export default async function CheckoutPage() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    redirect("/login?next=/checkout")
  }

  const enabled = await readPlatformConfig<boolean>(db, "checkout_enabled", {
    actorUserId: session.user.id,
    reason: "checkout_enabled gate check",
  })
  if (enabled !== true) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
        <div className="mt-6 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-sm text-yellow-900">Checkout is temporarily unavailable.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Review your order</h1>
      <CheckoutForm />
    </main>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/checkout/page.tsx
git commit -m "feat(web): /checkout server component shell with checkout_enabled gate"
```

---

## Task 16: `/checkout` client form

**Files:**

- Create: `apps/web/src/app/checkout/checkout-form.tsx`

- [ ] **Step 1: Implement the full client form**

Implement per spec §4.2. Key behaviour:

- Reads cart from localStorage via `useCart()`.
- Calls `priceCheckoutPreview({ items, voucherId: null })` on mount, then again whenever voucher selection changes.
- Renders invalid-line banner, per-store cards, voucher dropdown (labels per spec §4.2 — no `voucher.code`), discount preview, shipping address form (using `ShippingAddressSchema` for client validation), `TOTAL_NOT_PAYABLE` inline error.
- Pay button disabled if items.length === 0, preview.invalidLines.length > 0, preview.totalNotPayable, or address invalid.
- On submit: calls `initiateCheckout`, on success `window.location.assign(redirectUrl)`.

Code is ~300 lines; structure example:

```tsx
"use client"
import { useCallback, useEffect, useState, useTransition } from "react"
import { useCart } from "@/lib/cart"
import { ShippingAddressSchema, type ShippingAddressInput, MY_STATES } from "@/lib/shipping-address-schema"
import { CHECKOUT_USER_COPY, type CheckoutErrorCode } from "@/lib/checkout-errors"
import { priceCheckoutPreview, initiateCheckout } from "./actions"
import { formatMyrSen } from "@/lib/format"

export function CheckoutForm() {
  const { items, hydrated } = useCart()
  const [voucherId, setVoucherId] = useState<string | null>(null)
  const [preview, setPreview] = useState<...>(null)
  const [address, setAddress] = useState<Partial<ShippingAddressInput>>({ country: "MY" })
  const [addressErrors, setAddressErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<CheckoutErrorCode | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reprice whenever items or voucher change
  useEffect(() => {
    if (!hydrated || items.length === 0) return
    startTransition(async () => {
      const r = await priceCheckoutPreview({ items: items.map(i => ({ variantId: i.variantId, quantity: i.quantity })), voucherId })
      setPreview(r)
    })
  }, [hydrated, JSON.stringify(items), voucherId])

  const onSubmit = useCallback(async () => {
    const parsed = ShippingAddressSchema.safeParse(address)
    if (!parsed.success) {
      setAddressErrors(parsed.error.flatten().fieldErrors as Record<string, string>)
      return
    }
    setAddressErrors({})
    setSubmitError(null)
    startTransition(async () => {
      const r = await initiateCheckout({
        items: items.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
        voucherId, shippingAddress: parsed.data,
      })
      if (r.ok) {
        window.location.assign(r.redirectUrl)
      } else {
        setSubmitError(r.error)
      }
    })
  }, [items, voucherId, address])

  // ... render: invalid lines banner, per-store cards, voucher dropdown, discount preview, address form, error display, submit button
}
```

Build it section by section. Use the existing storefront UI patterns (`tailwind`-styled cards) for consistency with `/products` and `/brands/[slug]`.

- [ ] **Step 2: Manual smoke in dev**

```bash
pnpm --filter @bomy/web dev
```

Add items to cart, navigate to `/checkout`, verify the preview renders, the voucher dropdown shows owned vouchers (seed one if needed), address form blocks invalid inputs.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/checkout/checkout-form.tsx
git commit -m "feat(web): /checkout client form — preview, voucher dropdown, address form, pay button"
```

---

## Task 17: `/checkout/success` + poller

**Files:**

- Create: `apps/web/src/app/checkout/success/page.tsx`
- Create: `apps/web/src/app/checkout/success/poller.tsx`

- [ ] **Step 1: Implement the server shell**

```tsx
// apps/web/src/app/checkout/success/page.tsx
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { withTenant, db, schema } from "@bomy/db"
import { eq, and } from "drizzle-orm"
import { SuccessPoller } from "./poller"

export default async function CheckoutSuccess({
  searchParams,
}: {
  searchParams: { session?: string }
}) {
  const session = await getServerSession()
  if (!session?.user?.id) redirect("/login")
  const sessionId = searchParams.session
  if (!sessionId) return <main>Missing session id.</main>

  const rows = await withTenant(db, { userId: session.user.id, userRole: "buyer" }, async (tx) =>
    tx
      .select({ id: schema.checkoutSessions.id, status: schema.checkoutSessions.status })
      .from(schema.checkoutSessions)
      .where(
        and(
          eq(schema.checkoutSessions.id, sessionId),
          eq(schema.checkoutSessions.userId, session.user.id),
        ),
      )
      .limit(1),
  )
  if (rows.length === 0) return <main className="p-8">Session not found.</main>

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Confirming your payment…</h1>
      <SuccessPoller sessionId={sessionId} initialStatus={rows[0].status} />
    </main>
  )
}
```

- [ ] **Step 2: Implement the client poller**

```tsx
// apps/web/src/app/checkout/success/poller.tsx
"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/lib/cart"
import { getCheckoutSessionStatus } from "../actions"

export function SuccessPoller({
  sessionId,
  initialStatus,
}: {
  sessionId: string
  initialStatus: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const [timedOut, setTimedOut] = useState(false)
  const { clearCart } = useCart()
  const router = useRouter()

  useEffect(() => {
    if (status === "paid") {
      clearCart()
      return
    }
    if (["failed", "cancelled", "expired"].includes(status)) {
      router.replace(`/checkout/cancelled?session=${sessionId}&reason=${status}`)
      return
    }
    const start = Date.now()
    const interval = setInterval(async () => {
      if (Date.now() - start > 30_000) {
        setTimedOut(true)
        clearInterval(interval)
        return
      }
      const r = await getCheckoutSessionStatus(sessionId)
      if ("status" in r) setStatus(r.status)
    }, 2000)
    return () => clearInterval(interval)
  }, [status, sessionId, clearCart, router])

  if (status === "paid") return <p>Payment successful — your orders are being prepared.</p>
  if (status === "payment_review_required")
    return <p>We need to verify your payment — our team will be in touch.</p>
  if (timedOut) return <p>Your payment is still processing — check your orders page shortly.</p>
  return <p>Confirming payment…</p>
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/checkout/success/
git commit -m "feat(web): /checkout/success — poll session status, clear cart on paid"
```

---

## Task 18: `/checkout/cancelled` + cancel-trigger

**Files:**

- Create: `apps/web/src/app/checkout/cancelled/page.tsx`
- Create: `apps/web/src/app/checkout/cancelled/cancel-trigger.tsx`

- [ ] **Step 1: Server shell — no mutation on GET render**

```tsx
// apps/web/src/app/checkout/cancelled/page.tsx
import { getServerSession } from "@/lib/auth"
import { withTenant, db, schema } from "@bomy/db"
import { eq, and } from "drizzle-orm"
import { CancelTrigger } from "./cancel-trigger"

export default async function CheckoutCancelled({
  searchParams,
}: {
  searchParams: { session?: string; reason?: string }
}) {
  const session = await getServerSession()
  const sessionId = searchParams.session
  let initialStatus: string | null = null
  if (session?.user?.id && sessionId) {
    const rows = await withTenant(db, { userId: session.user.id, userRole: "buyer" }, async (tx) =>
      tx
        .select({ status: schema.checkoutSessions.status })
        .from(schema.checkoutSessions)
        .where(
          and(
            eq(schema.checkoutSessions.id, sessionId),
            eq(schema.checkoutSessions.userId, session.user.id),
          ),
        )
        .limit(1),
    )
    initialStatus = rows[0]?.status ?? null
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Checkout cancelled</h1>
      {sessionId && initialStatus === "pending_payment" && <CancelTrigger sessionId={sessionId} />}
      <p className="mt-4 text-sm text-gray-600">Your items are still in your cart.</p>
    </main>
  )
}
```

- [ ] **Step 2: Client cancel-trigger**

```tsx
// apps/web/src/app/checkout/cancelled/cancel-trigger.tsx
"use client"
import { useEffect, useRef, useState } from "react"
import { cancelPendingCheckout } from "../actions"

export function CancelTrigger({ sessionId }: { sessionId: string }) {
  const calledRef = useRef(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true
    void cancelPendingCheckout(sessionId).then(() => setDone(true))
  }, [sessionId])
  if (done) return null
  return <p className="mt-2 text-xs text-gray-400">Releasing reservations…</p>
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/checkout/cancelled/
git commit -m "feat(web): /checkout/cancelled — auto-POST compensation via client component"
```

---

## Task 19: `InventoryReservationExpiryJob`

**Files:**

- Create: `apps/api/src/jobs/inventory-reservation-expiry.ts`
- Modify: `apps/api/src/scheduler.ts` — register schedule
- Create: `apps/api/tests/jobs/inventory-reservation-expiry.test.ts`

- [ ] **Step 1: Write failing tests for the job**

Tests 43-52 from spec §6.5:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { setupTestDb, type TestDb } from "@/test-helpers"
import { runInventoryReservationExpiryJob } from "@/jobs/inventory-reservation-expiry"

describe("InventoryReservationExpiryJob", () => {
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

  test("active reservation past grace → expired, stock restored, voucher released, session expired, audit row written", async () => {
    /* ... */
  })
  test("active reservation within grace → skipped", async () => {
    /* ... */
  })
  test("active reservation but session.status=paid → skipped entirely", async () => {
    /* ... */
  })
  test("active reservation but session.status=payment_review_required → skipped", async () => {
    /* ... */
  })
  test("stale failed session past grace → reservation expired, stock restored, voucher released, session.status stays 'failed'", async () => {
    /* ... */
  })
  test("stale cancelled session past grace → reservation expired, stock restored, voucher released, session.status stays 'cancelled'", async () => {
    /* ... */
  })
  test("orphan session (no reservations, no PSP id, past grace) → cancelled", async () => {
    /* ... */
  })
  test("orphan-guard: session pending + no PSP id + past grace + still has active reservation → NOT cancelled by orphan pass", async () => {
    /* ... */
  })
  test("two concurrent runs (SKIP LOCKED) → both succeed, result idempotent", async () => {
    /* ... */
  })
  test("batch size 500: 600 candidates → first run processes 500 oldest; next run processes 100", async () => {
    /* ... */
  })
})
```

- [ ] **Step 2: Implement the job per spec §5.2**

```ts
// apps/api/src/jobs/inventory-reservation-expiry.ts
import { and, eq, isNull, sql } from "drizzle-orm"
import {
  checkoutSessions,
  inventoryReservations,
  productVariants,
  vouchers,
  withAdmin,
  SYSTEM_ACTOR,
} from "@bomy/db"
import type { JobDeps } from "../scheduler"

const POST_PAYMENT = new Set(["paid", "payment_review_required", "payment_review_resolved"])

export async function runInventoryReservationExpiryJob(deps: JobDeps): Promise<void> {
  const { db, log } = deps
  await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "inventory_reservation_expiry_job" },
    async (tx) => {
      // 1. Lock candidates (cs + r) via raw SQL — Drizzle's .for() doesn't expose multi-table OF
      const candidates = await tx.execute(sql`
        SELECT r.id AS reservation_id, r.variant_id, r.quantity, r.checkout_session_id AS session_id,
               cs.status AS session_status, cs.user_id AS session_user_id
          FROM inventory_reservations r
          INNER JOIN checkout_sessions cs ON cs.id = r.checkout_session_id
         WHERE r.status = 'active'
           AND r.expires_at < now() - interval '5 minutes'
         ORDER BY r.expires_at ASC
         LIMIT 500
         FOR UPDATE OF cs, r SKIP LOCKED
      `)

      const sessionsTouched = new Map<string, string>()

      for (const c of candidates.rows as Array<{
        reservation_id: string
        variant_id: string
        quantity: number
        session_id: string
        session_status: string
        session_user_id: string
      }>) {
        if (POST_PAYMENT.has(c.session_status)) continue
        const released = await tx
          .update(inventoryReservations)
          .set({ status: "expired", updatedAt: sql`now()` })
          .where(
            and(
              eq(inventoryReservations.id, c.reservation_id),
              eq(inventoryReservations.status, "active"),
            ),
          )
          .returning({ id: inventoryReservations.id })
        if (released.length === 0) continue
        await tx
          .update(productVariants)
          .set({ stockCount: sql`stock_count + ${c.quantity}`, updatedAt: sql`now()` })
          .where(eq(productVariants.id, c.variant_id))
        sessionsTouched.set(c.session_id, c.session_user_id)
      }

      for (const [sessionId, userId] of sessionsTouched) {
        await tx
          .update(vouchers)
          .set({ reservedCheckoutSessionId: null, reservedAt: null })
          .where(
            and(
              eq(vouchers.reservedCheckoutSessionId, sessionId),
              isNull(vouchers.redeemedAt),
              eq(vouchers.userId, userId),
            ),
          )
        await tx
          .update(checkoutSessions)
          .set({ status: "expired", updatedAt: sql`now()` })
          .where(
            and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.status, "pending_payment")),
          )
      }

      // Orphan pass — NOT EXISTS guards (raw because Drizzle correlated-subquery support is awkward)
      const orphans = await tx.execute(sql`
        UPDATE checkout_sessions cs
           SET status = 'cancelled', updated_at = now()
         WHERE cs.status = 'pending_payment'
           AND cs.psp_payment_request_id IS NULL
           AND cs.expires_at < now() - interval '5 minutes'
           AND NOT EXISTS (
             SELECT 1 FROM inventory_reservations r
              WHERE r.checkout_session_id = cs.id AND r.status = 'active'
           )
           AND NOT EXISTS (
             SELECT 1 FROM vouchers v
              WHERE v.reserved_checkout_session_id = cs.id AND v.redeemed_at IS NULL
           )
         RETURNING id, user_id
      `)

      log.info(
        {
          candidates: candidates.rows.length,
          sessionsTouched: sessionsTouched.size,
          orphansCancelled: orphans.rows.length,
        },
        "inventory_reservation_expiry_job: done",
      )
    },
  )
}
```

- [ ] **Step 3: Register the schedule**

Open `apps/api/src/scheduler.ts`. After the existing scheduled jobs, add:

```ts
import { runInventoryReservationExpiryJob } from "./jobs/inventory-reservation-expiry"
// ...
scheduler.schedule("inventory_reservation_expiry", "*/10 * * * *", () =>
  runInventoryReservationExpiryJob({ db, log: log.child({ job: "inventory_reservation_expiry" }) }),
)
```

- [ ] **Step 4: Run tests until green**

```bash
pnpm --filter @bomy/api test inventory-reservation-expiry.test.ts
```

Expected: PASS (10/10).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/inventory-reservation-expiry.ts apps/api/src/scheduler.ts apps/api/tests/jobs/inventory-reservation-expiry.test.ts
git commit -m "feat(api): InventoryReservationExpiryJob — every 10 min, FOR UPDATE OF, terminal-state preservation, orphan NOT EXISTS guards"
```

---

## Task 20: Full integration smoke + branch hygiene

- [ ] **Step 1: Run the whole test suite**

```bash
pnpm test
```

Expected: All packages green.

- [ ] **Step 2: Typecheck across all packages**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Lint + format**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 4: Manual smoke against running stack**

```bash
docker compose -f infra/docker/compose.yml up -d postgres redis minio mailhog
pnpm --filter @bomy/web dev
pnpm --filter @bomy/api dev
```

In a separate terminal, enable checkout for the smoke (will revert before pushing):

```bash
psql $DATABASE_URL -c "UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'checkout_enabled'"
```

Visit `http://localhost:3000`, add product to cart, go to `/checkout`, fill address, hit Pay with HitPay. The HitPay client will throw without real creds — verify compensation runs (session ends `cancelled`, stock restored). Check `admin_bypass_audit` for the initiation + compensation rows.

```bash
psql $DATABASE_URL -c "UPDATE platform_config SET value = 'false'::jsonb WHERE key = 'checkout_enabled'"
```

**Critical:** revert to `false` before pushing — PR #32 isn't live yet.

- [ ] **Step 5: Update handoff and push**

Update `.andy/handoff.md` to reflect PR #31 status (in flight → ready for review). Stage + commit:

```bash
git add .andy/handoff.md
git commit -m "chore: update handoff — PR #31 ready for review"
git push -u origin feat/cart-checkout
```

Open PR via `gh pr create` with title `feat(web,db,api): cart + checkout (PR #31)` and body referencing the spec.

---

## Self-review

**Spec coverage:** Each numbered task maps to a spec section. Cross-check:

- Spec §2 (migration 0011) → Tasks 1–3 ✓
- Spec §3.1–3.8 (server action flow) → Tasks 9, 11, 12, 13 ✓
- Spec §4.1 (/cart) → Task 14 ✓
- Spec §4.2 (/checkout) → Tasks 15, 16 ✓
- Spec §4.3 (/checkout/success) → Task 17 ✓
- Spec §4.4 (/checkout/cancelled) → Task 18 ✓
- Spec §5 (expiry job + lock order) → Task 19 ✓
- Spec §6 (test matrix) → Tasks 4, 9, 11, 12, 13, 19 ✓
- Spec §7 (observability) → folded into job and action implementations
- Spec §10 verification items (Drizzle multi-table FOR UPDATE OF; withTenant readOnly; SYSTEM_ACTOR import; senToMyr) → Task 19 uses raw SQL for `FOR UPDATE OF`; withTenant readOnly is intentionally **not** added; SYSTEM_ACTOR comes from `@bomy/db`; senToMyr lands in Task 5.

**Placeholder scan:** No "TBD" or "TODO" steps. The few `/* ... */` comments in test skeletons (Task 4 Step 1, Task 9 Step 1, Task 11 Step 1, Task 13 Step 1, Task 19 Step 1) are explicitly framed as test bodies the implementer must flesh out, with the spec section reference and assertion shape provided. Test bodies are intentionally not pre-written verbatim because each requires use of the existing test seeding harness (`db.seed.user`, etc.) — the implementer must mirror existing patterns in `packages/db/tests/catalog.test.ts` and `apps/web/tests/storefront/queries.test.ts`. Each step explicitly says: "mirror the existing pattern in <file>" and lists the assertions expected.

**Type consistency:** `CheckoutLine`, `VoucherInput`, `CheckoutTotals`, `CheckoutError`, `ShippingAddressInput`, error code union are defined once and referenced consistently. `compensateInitiation` signature matches all four call sites (initiate hitpay-fail, initiate psp-ref-fail, initiate psp-ref-zero-rows, cancelPendingCheckout). `withAdmin(db, { userId, reason }, fn)` and `withTenant(db, { userId, userRole }, fn)` signatures consistent throughout.

**Gap-fix:** Task 14 (`/cart` update) was originally only steps 1-3 but is referenced as Task 17 in spec §4.5 — renumbered the task list accordingly so the cart change ships in the same PR. Order: 14 (cart) → 15 (checkout shell) → 16 (checkout form) → 17 (success) → 18 (cancelled) → 19 (job) → 20 (smoke). All cross-references updated.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-pr31-cart-checkout.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
