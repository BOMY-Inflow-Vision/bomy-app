# PR #31 — Cart + Checkout Design

**Date:** 2026-05-15
**Author:** Andy (AI technical lead)
**Reviewer:** Bob (strategist developer)
**Status:** Ready for implementation
**Builds on:** Stage 5 spec (`2026-05-13-stage5-products-orders-design.md`) §3.3, §4.1, §4.2, §4.5
**Branch:** `feat/cart-checkout` (next merge → `main`)
**Migration number:** `0011_cart_checkout.sql` (spec says 0010, but 0010 was used by storefront RLS fix in PR #30)

---

## 1. Scope

PR #31 lands the buyer-facing checkout initiation surface and supporting schema. It snapshots prices, reserves stock and vouchers, computes brand-subscription discounts, and redirects to HitPay. It does **not** create orders, write to the ledger, or claim vouchers — those are PR #32 (order webhook fan-out).

### 1.1 Ships in this PR

1. Migration `0011_cart_checkout.sql` — checkout session tables, inventory reservations, voucher reservation/redemption FK columns, store flat shipping fee column, three new enums, `platform_config.checkout_enabled = false` seed, RLS policies, all CHECKs from Stage 5 spec §3.5, complete index set (Section 2.4).
2. Checkout initiation server action `initiateCheckout` (`apps/web/src/app/checkout/actions.ts`) — Phase 1 single transaction + Phase 1b HitPay redirect.
3. `priceCheckoutPreview` server action — read-only re-pricing for the `/checkout` page render.
4. `compensateInitiation` helper — guarded, idempotent cleanup for HitPay failures and buyer cancellations.
5. `cancelPendingCheckout` POST server action — invoked from `/checkout/cancelled` route.
6. `/checkout`, `/checkout/success`, `/checkout/cancelled` Next.js routes.
7. `runInventoryReservationExpiryJob` (`apps/api/src/jobs/inventory-reservation-expiry.ts`) — scheduled every 10 min.
8. Integration tests against real Postgres (schema/RLS, server action paths, preview math, job behaviour).

### 1.2 Out of scope (deferred to subsequent PRs)

- Order tables, order webhook handler, ledger fan-out, voucher claim, payment confirmation (**PR #32**).
- Seller dashboard editing of `flat_shipping_fee_sen` (**PR #33**).
- Order management UI (buyer order list, seller order list, admin views) (**PR #33**).
- Email notifications wired to real sending (**PR #34**).
- Resume / replace flow for an existing pending checkout session. Buyer with a pending session is blocked from starting a new one (returns `PENDING_CHECKOUT_EXISTS` with the existing sessionId). Replace flow can be added later if needed.
- Rate limiting on `initiateCheckout`. Single-pending enforcement + `checkout_enabled` gate are the boundary for PR #31.

### 1.3 Post-merge runbook

`checkout_enabled` stays `false` after PR #31 merge. **Flip to `true` is gated on:**

1. PR #32 (`feat/order-webhook-ledger`) is merged and deployed.
2. Webhook fan-out smoke test passes end-to-end on staging (test buyer paid, order created, ledger balanced, voucher claimed).
3. Ops accepts or sets `stores.flat_shipping_fee_sen` per active store (`0` is acceptable if seller explicitly accepts "free shipping" until edit UI lands in PR #33).

Until all three pass, ops keeps `checkout_enabled = false`. Server action short-circuits with `CHECKOUT_DISABLED` and no side effects.

---

## 2. Migration 0011 (`0011_cart_checkout.sql`)

### 2.1 New enums

```sql
CREATE TYPE checkout_session_status AS ENUM (
  'pending_payment','paid','failed','expired','cancelled',
  'payment_review_required','payment_review_resolved'
);
CREATE TYPE inventory_reservation_status AS ENUM (
  'active','released','expired','converted'
);
CREATE TYPE psp_provider AS ENUM ('hitpay','stripe');
```

`psp_provider` includes `stripe` as a dual-PSP seam for Stage 6+; **PR #31 code only ever inserts `'hitpay'`**. No reachable Stripe path in this PR.

### 2.2 `ALTER stores`

```sql
ALTER TABLE stores
  ADD COLUMN flat_shipping_fee_sen bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT stores_flat_shipping_fee_sen_chk CHECK (flat_shipping_fee_sen >= 0);
```

`0` means "free shipping until configured." Sellers cannot edit yet (Stage 5 spec defers UI to PR #33).

### 2.3 New tables

Full column lists per Stage 5 spec §3.3. Summary:

#### `checkout_sessions`

All columns and CHECKs per spec §3.3 + §3.5. Notable:

- `id uuid PK` — used as HitPay `reference_number`.
- `user_id uuid NOT NULL REFERENCES users(id)`.
- `status checkout_session_status NOT NULL DEFAULT 'pending_payment'`.
- `psp_provider psp_provider NOT NULL DEFAULT 'hitpay'`.
- `psp_payment_request_id text` — unique partial.
- `psp_payment_id text` — unique partial (set by PR #32 webhook).
- `expires_at timestamptz NOT NULL` — `now() + 30 min` at insertion.
- `shipping_address jsonb NOT NULL`.
- All money totals as `bigint` sen.

#### `checkout_session_items`

- `id uuid PK`
- `checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id)`
- `store_id uuid NOT NULL REFERENCES stores(id)` (denormalised for fan-out in PR #32)
- `variant_id uuid REFERENCES product_variants(id)` (nullable: survives variant deletion)
- `product_snapshot jsonb NOT NULL`, `variant_snapshot jsonb NOT NULL`
- `quantity integer NOT NULL CHECK (quantity > 0)`
- `unit_price_sen bigint NOT NULL`
- `line_total_sen bigint NOT NULL CHECK (line_total_sen = quantity * unit_price_sen)`
- `brand_discount_sen bigint NOT NULL DEFAULT 0`

#### `checkout_session_stores`

- `id uuid PK`
- `checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id)`
- `store_id uuid NOT NULL REFERENCES stores(id)`
- `retail_subtotal_sen`, `brand_discount_sen`, `discounted_subtotal_sen`, `voucher_contribution_sen`, `shipping_fee_sen`, `psp_fee_allocated_sen` — all `bigint NOT NULL`
- UNIQUE `(checkout_session_id, store_id)`
- CHECKs per spec §3.5

#### `inventory_reservations`

- `id uuid PK`
- `variant_id uuid NOT NULL REFERENCES product_variants(id)`
- `checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id)`
- `quantity integer NOT NULL CHECK (quantity > 0)`
- `status inventory_reservation_status NOT NULL DEFAULT 'active'`
- `expires_at timestamptz NOT NULL`
- No direct user RLS — managed only via `withAdmin` (durable audit per PR #26).

### 2.4 Indexes

```sql
-- checkout_sessions
CREATE INDEX checkout_sessions_user_idx ON checkout_sessions (user_id);
CREATE INDEX checkout_sessions_user_pending_idx ON checkout_sessions (user_id, status)
  WHERE status = 'pending_payment';
CREATE UNIQUE INDEX checkout_sessions_psp_payment_request_unique_idx
  ON checkout_sessions (psp_payment_request_id) WHERE psp_payment_request_id IS NOT NULL;
CREATE UNIQUE INDEX checkout_sessions_psp_payment_id_unique_idx
  ON checkout_sessions (psp_payment_id) WHERE psp_payment_id IS NOT NULL;
CREATE INDEX checkout_sessions_status_expires_idx ON checkout_sessions (status, expires_at);

-- checkout_session_items
CREATE INDEX checkout_session_items_session_idx ON checkout_session_items (checkout_session_id);
CREATE INDEX checkout_session_items_session_store_idx
  ON checkout_session_items (checkout_session_id, store_id);
CREATE INDEX checkout_session_items_variant_idx ON checkout_session_items (variant_id);
CREATE INDEX checkout_session_items_store_idx ON checkout_session_items (store_id);

-- checkout_session_stores
CREATE INDEX checkout_session_stores_session_idx ON checkout_session_stores (checkout_session_id);
CREATE INDEX checkout_session_stores_store_idx ON checkout_session_stores (store_id);

-- inventory_reservations
CREATE INDEX inventory_reservations_status_expires_idx
  ON inventory_reservations (status, expires_at);
CREATE INDEX inventory_reservations_session_idx
  ON inventory_reservations (checkout_session_id);
CREATE INDEX inventory_reservations_variant_idx ON inventory_reservations (variant_id);

-- vouchers (new partial index for available-voucher lookup at /checkout)
CREATE INDEX vouchers_available_user_idx ON vouchers (user_id, expires_at)
  WHERE redeemed_at IS NULL AND reserved_checkout_session_id IS NULL;
```

### 2.5 `ALTER vouchers`

```sql
-- Add the three new FK columns first (safe — checkout_sessions exists earlier in this migration)
ALTER TABLE vouchers
  ADD COLUMN reserved_checkout_session_id uuid REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  ADD COLUMN reserved_at timestamptz,
  ADD COLUMN redeemed_checkout_session_id uuid REFERENCES checkout_sessions(id) ON DELETE SET NULL;

-- Drop the soft FK placeholder (never populated in Stage 4)
ALTER TABLE vouchers DROP COLUMN redeemed_order_id;
```

`redeemed_at` already exists from Stage 4 — not touched.

### 2.6 `platform_config` seed

```sql
INSERT INTO platform_config (key, value, description)
VALUES (
  'checkout_enabled',
  'false'::jsonb,
  'Master gate for /checkout server action. Flip to true only after PR #32 webhook fan-out is live, smoke-tested, and ops accepts current stores.flat_shipping_fee_sen values.'
)
ON CONFLICT (key) DO NOTHING;
```

No `platform_config_audit` entry from the migration (system-seeded, not admin-changed).

### 2.7 RLS policies

All four new tables get `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;` with default-deny. Policies appended to `packages/db/src/rls/policies.sql`.

Predicates use existing functions: `app.current_user_id()`, `app.is_bomy_staff()`, `app.is_admin_bypass()`.

**All writes to every checkout-related table go through `withAdmin`.** Buyer-scoped (`withTenant`) DB paths get **SELECT only**. This narrows the attack surface: no `withTenant` code path can mutate checkout/payment rows. Staff readability (for admin views in PR #33) is allowed on SELECT; writes remain admin-bypass only.

All INSERT/UPDATE policies use `WITH CHECK` clauses, not only `USING`. Examples:

```sql
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
```

`checkout_session_items` and `checkout_session_stores` policies — SELECT joins parent for buyer; writes are admin-only:

```sql
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
  FOR INSERT
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_session_items_admin_update ON checkout_session_items
  FOR UPDATE
  USING (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY checkout_session_items_admin_delete ON checkout_session_items
  FOR DELETE
  USING (app.is_admin_bypass());
```

(Same shape for `checkout_session_stores`.)

`inventory_reservations` — staff/admin may read; writes are admin-bypass only:

```sql
CREATE POLICY inventory_reservations_staff_select ON inventory_reservations
  FOR SELECT
  USING (app.is_admin_bypass() OR app.is_bomy_staff());

CREATE POLICY inventory_reservations_admin_insert ON inventory_reservations
  FOR INSERT
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY inventory_reservations_admin_update ON inventory_reservations
  FOR UPDATE
  USING (app.is_admin_bypass())
  WITH CHECK (app.is_admin_bypass());

CREATE POLICY inventory_reservations_admin_delete ON inventory_reservations
  FOR DELETE
  USING (app.is_admin_bypass());
```

`withPublicRead` (PR #30) gets nothing on these tables.

### 2.8 Drizzle schema additions

New files under `packages/db/src/schema/`:

- `checkout_sessions.ts`
- `checkout_session_items.ts`
- `checkout_session_stores.ts`
- `inventory_reservations.ts`

Edited files:

- `enums.ts` — add three new enums
- `stores.ts` — add `flatShippingFeeSen: bigint({ mode: 'bigint' })`
- `vouchers.ts` — drop `redeemedOrderId`, add `reservedCheckoutSessionId`, `reservedAt`, `redeemedCheckoutSessionId`
- `index.ts` — export the four new schemas

---

## 3. Checkout server action flow

### 3.1 Entry shape

`apps/web/src/app/checkout/actions.ts` exports:

```ts
export type CheckoutLineInput = {
  variantId: string
  quantity: number
}

export type InitiateCheckoutInput = {
  items: CheckoutLineInput[] // client-advised; re-validated server-side
  voucherId: string | null
  shippingAddress: ShippingAddressInput // Zod-validated
}

export async function initiateCheckout(
  input: InitiateCheckoutInput,
): Promise<InitiateCheckoutResult>
export async function priceCheckoutPreview(input: {
  items: CheckoutLineInput[]
  voucherId: string | null
}): Promise<CheckoutPreviewResult>
export async function cancelPendingCheckout(
  sessionId: string,
): Promise<{ ok: true } | { error: CheckoutError }>
export async function getCheckoutSessionStatus(
  sessionId: string,
): Promise<{ status: CheckoutSessionStatus } | { error: "NOT_FOUND" }>
```

Only `items[].quantity` is trusted from client input. All other values (prices, stock, product/variant active, store active, shipping, brand discount, voucher amounts) come from the database in the server action.

### 3.2 Pre-transaction guards

For `initiateCheckout`:

1. Auth check: `session.user.id` required, else `UNAUTHENTICATED`.
2. `checkout_enabled` lookup: `await readPlatformConfig('checkout_enabled')`. If `!== true` → `CHECKOUT_DISABLED`. Returns to user as "Checkout is temporarily unavailable."
3. Empty cart: `items.length === 0` → `EMPTY_CART`.
4. Shipping address Zod validation (see §3.7). Fail → `INVALID_ADDRESS` with field-level errors.
5. Generate `sessionId = randomUUID()` server-side. Used everywhere downstream.

### 3.3 Phase 1 — single `withAdmin` transaction

Reason: the buyer needs to write `inventory_reservations` (admin-only RLS) and decrement `product_variants.stock_count` (buyer is neither seller_owner nor staff). Atomicity is required across all writes. Single `withAdmin` envelope, one durable `admin_bypass_audit` row per initiation.

Phase 1 must return the values Phase 1b needs to call HitPay (`totalBuyerPaysSen` for the amount; `sessionId` is already known outside). The transaction returns a small persisted-session summary:

```ts
type Phase1Result = {
  sessionId: string                  // echo of the outer-scope sessionId
  totalBuyerPaysSen: bigint          // committed total — used as HitPay amount
}

const phase1: Phase1Result = await withAdmin(
  db,
  { userId: buyer.id, reason: `checkout_initiation:${sessionId}` },
  async (tx): Promise<Phase1Result> => {
    // 0. Per-buyer advisory lock to enforce single pending session
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('checkout:' || ${buyer.id}::text))`)

    // 1. Single-pending enforcement
    const existing = await tx.select({ id: checkoutSessions.id })
      .from(checkoutSessions)
      .where(and(
        eq(checkoutSessions.userId, buyer.id),
        eq(checkoutSessions.status, 'pending_payment'),
        gt(checkoutSessions.expiresAt, sql`now()`),
      ))
      .limit(1)
    if (existing.length > 0) throw new CheckoutError('PENDING_CHECKOUT_EXISTS', { sessionId: existing[0].id })

    // 2. Validate variants — join through products + stores
    const validated = await tx.select({...}).from(productVariants)
      .innerJoin(products, ...)
      .innerJoin(stores, ...)
      .where(inArray(productVariants.id, variantIds))
      .for('update')                          // row-lock variants for atomic stock decrement
    // Reject any: missing, v.is_active = false, p.status != 'active',
    //             s.status != 'active', v.stock_count < requested_qty
    // Fail -> CheckoutError('INVALID_CART', { invalidLines: [...] })

    // 3. Validate voucher (if voucherId)
    let voucher: VoucherRow | null = null
    if (voucherId) {
      const rows = await tx.select().from(vouchers)
        .where(and(
          eq(vouchers.id, voucherId),
          eq(vouchers.userId, buyer.id),
          isNull(vouchers.redeemedAt),
          isNull(vouchers.reservedCheckoutSessionId),
          gt(vouchers.expiresAt, sql`now()`),
        ))
        .for('update')                         // row-lock to prevent concurrent dual-use
        .limit(1)
      if (rows.length === 0) throw new CheckoutError('VOUCHER_UNAVAILABLE')
      voucher = rows[0]
    }

    // 4. Lookup active brand subscriptions for buyer × distinct store_ids
    //    Only if voucher is null (mutual exclusion)
    const brandSubs = voucher ? new Map() : await loadActiveBrandSubs(tx, buyer.id, distinctStoreIds)

    // 5. Compute totals (integer sen, ascending store_id, last-store-absorbs)
    const computed = computeCheckoutTotals({
      lines: validated,
      brandSubs,
      voucher,
      shippingFees: storeShippingFees,
    })

    // 6. Pre-insert payable guard
    if (computed.totalBuyerPaysSen <= 0n) throw new CheckoutError('TOTAL_NOT_PAYABLE')

    // 7. Insert checkout_sessions
    await tx.insert(checkoutSessions).values({
      id: sessionId, userId: buyer.id, status: 'pending_payment',
      pspProvider: 'hitpay',
      shippingAddress: validatedAddress,
      voucherId: voucher?.id ?? null,
      ...computed.totals,
      expiresAt: sql`now() + interval '30 minutes'`,
    })

    // 8. Insert checkout_session_items
    await tx.insert(checkoutSessionItems).values(computed.itemRows)

    // 9. Insert checkout_session_stores
    await tx.insert(checkoutSessionStores).values(computed.storeRows)

    // 10. Atomic stock decrement per variant — single UPDATE each
    for (const line of computed.itemRows) {
      const r = await tx.update(productVariants)
        .set({ stockCount: sql`stock_count - ${line.quantity}`, updatedAt: sql`now()` })
        .where(and(
          eq(productVariants.id, line.variantId),
          gte(productVariants.stockCount, line.quantity),
        ))
        .returning({ id: productVariants.id })
      if (r.length === 0) throw new CheckoutError('OUT_OF_STOCK_RACE', { variantId: line.variantId })
    }

    // 11. Insert inventory_reservations
    await tx.insert(inventoryReservations).values(computed.reservationRows)

    // 12. Reserve voucher (if any)
    if (voucher) {
      const r = await tx.update(vouchers)
        .set({ reservedCheckoutSessionId: sessionId, reservedAt: sql`now()` })
        .where(and(
          eq(vouchers.id, voucher.id),
          isNull(vouchers.redeemedAt),
          isNull(vouchers.reservedCheckoutSessionId),
          gt(vouchers.expiresAt, sql`now()`),
        ))
        .returning({ id: vouchers.id })
      if (r.length === 0) throw new CheckoutError('VOUCHER_RACE')
    }

    // 13. Return persisted-session summary for Phase 1b
    return { sessionId, totalBuyerPaysSen: computed.totalBuyerPaysSen }
  },
)
```

Lock order inside the transaction: `checkout_sessions` (via advisory lock + pending-session SELECT) → `product_variants` (via FOR UPDATE in validation, then row-locked by the UPDATE) → `vouchers` (via FOR UPDATE in validation, then row-locked by the UPDATE) → `inventory_reservations` (write-only, no prior locks needed since rows are inserted fresh).

### 3.4 Computation rules

All integer sen, deterministic iteration ascending by `store_id`, last store absorbs rounding.

Per item:

- `line_total_sen = unit_price_sen × quantity`

Per item (brand discount, only when voucher is null):

- For matching active `brand_subscriptions`: `line.brand_discount_sen = floor(line_total_sen × discount_pct / 100)`
- Uses `brand_subscriptions.discount_pct` snapshot (NOT live `brand_subscription_plans.discount_pct`).

Per store:

- `retail_subtotal_sen = sum(line_total_sen)`
- `brand_discount_sen = sum(line.brand_discount_sen)` (= 0 if voucher present)
- `discounted_subtotal_sen = retail_subtotal_sen − brand_discount_sen`
- `shipping_fee_sen = stores.flat_shipping_fee_sen` (snapshot)

Session-level:

- `total_catalog_sen = sum(retail_subtotal_sen)` over stores
- `total_shipping_sen = sum(shipping_fee_sen)` over stores
- `brand_discount_total_sen = sum(brand_discount_sen)` (= 0 if voucher present)
- Voucher value (catalog-only, capped at `total_catalog_sen`):
  - `fixed_myr` → `min(fixed_amount_sen, total_catalog_sen)`
  - `random_myr` → `min(random_resolved_sen, total_catalog_sen)`
  - `percentage` → `floor(total_catalog_sen × percentage / 100)`
- `voucher_discount_sen = computed voucher value`

Per-store voucher allocation (when voucher present):

- `voucher_contribution_sen = floor(retail_subtotal_sen × voucher_discount_sen / total_catalog_sen)`
- Last store (highest `store_id`) absorbs remainder so `sum(voucher_contribution_sen) = voucher_discount_sen` exactly.

Final:

- `total_buyer_pays_sen = total_catalog_sen + total_shipping_sen − voucher_discount_sen − brand_discount_total_sen`

Pre-insert guard: `total_buyer_pays_sen > 0` else `TOTAL_NOT_PAYABLE`.

DB CHECKs also enforce these invariants — server-side computation must satisfy them before insert; computation rules and CHECKs cannot disagree.

### 3.5 Phase 1b — HitPay call

```ts
let paymentRequest: PaymentRequestResponse
try {
  paymentRequest = await hitpayClient().createPaymentRequest({
    amount: senToMyr(phase1.totalBuyerPaysSen), // 2dp string, sourced from the committed Phase 1 result
    currency: "MYR",
    reference_number: sessionId,
    redirect_url: `${WEB_BASE_URL}/checkout/success?session=${sessionId}`,
    cancel_url: `${WEB_BASE_URL}/checkout/cancelled?session=${sessionId}`,
    webhook: `${API_BASE_URL}/webhooks/hitpay`,
    name: `BOMY order #${sessionId.slice(0, 8)}`,
  })
} catch (err) {
  await compensateInitiation(sessionId, buyer.id, `hitpay_create_failed:${errCode(err)}`)
  throw new CheckoutError("PAYMENT_INIT_FAILED")
}

// Transaction 2: store PSP reference. Row-count guarded: if zero rows
// updated (e.g. session already cancelled or status race), treat as
// failure → compensate + return PAYMENT_INIT_FAILED. A buyer must never
// be redirected to HitPay for a session that didn't accept the PSP ref.
try {
  const updated = await withAdmin(
    db,
    { userId: buyer.id, reason: `checkout_store_psp_ref:${sessionId}` },
    async (tx) => {
      return tx
        .update(checkoutSessions)
        .set({
          pspPaymentRequestId: paymentRequest.id,
          pspPaymentUrl: paymentRequest.url,
          updatedAt: sql`now()`,
        })
        .where(
          and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.status, "pending_payment")),
        )
        .returning({ id: checkoutSessions.id })
    },
  )
  if (updated.length !== 1) {
    await compensateInitiation(sessionId, buyer.id, "store_psp_ref_zero_rows")
    throw new CheckoutError("PAYMENT_INIT_FAILED")
  }
} catch (err) {
  if (err instanceof CheckoutError) throw err
  await compensateInitiation(sessionId, buyer.id, "store_psp_ref_failed")
  throw new CheckoutError("PAYMENT_INIT_FAILED")
}

return { redirectUrl: paymentRequest.url }
```

Server action's caller (`/checkout` page client component) redirects via `redirect(paymentRequest.url)` on success.

### 3.6 `compensateInitiation`

```ts
export async function compensateInitiation(
  sessionId: string,
  buyerId: string,
  reason: string,
): Promise<void> {
  await withAdmin(
    db,
    { userId: buyerId, reason: `checkout_compensation:${reason}:${sessionId}` },
    async (tx) => {
      // 1. Lock and verify session ownership + state
      const sessions = await tx.select({ id: checkoutSessions.id })
        .from(checkoutSessions)
        .where(and(
          eq(checkoutSessions.id, sessionId),
          eq(checkoutSessions.userId, buyerId),
          eq(checkoutSessions.status, 'pending_payment'),
        ))
        .for('update')
        .limit(1)
      if (sessions.length === 0) return  // no-op: paid race, wrong owner, or already cancelled

      // 2. Release reservations (active -> released only)
      const released = await tx.update(inventoryReservations)
        .set({ status: 'released', updatedAt: sql`now()` })
        .where(and(
          eq(inventoryReservations.checkoutSessionId, sessionId),
          eq(inventoryReservations.status, 'active'),
        ))
        .returning({ variantId: ..., quantity: ... })

      // 3. Restore stock per released row
      for (const r of released) {
        await tx.update(productVariants)
          .set({ stockCount: sql`stock_count + ${r.quantity}`, updatedAt: sql`now()` })
          .where(eq(productVariants.id, r.variantId))
      }

      // 4. Release voucher (guarded: only if still reserved to this session, not redeemed, owned by buyer)
      await tx.update(vouchers)
        .set({ reservedCheckoutSessionId: null, reservedAt: null })
        .where(and(
          eq(vouchers.reservedCheckoutSessionId, sessionId),
          isNull(vouchers.redeemedAt),
          eq(vouchers.userId, buyerId),
        ))

      // 5. Mark session cancelled (status guard already passed by SELECT FOR UPDATE above)
      await tx.update(checkoutSessions)
        .set({ status: 'cancelled', updatedAt: sql`now()` })
        .where(and(
          eq(checkoutSessions.id, sessionId),
          eq(checkoutSessions.userId, buyerId),
          eq(checkoutSessions.status, 'pending_payment'),
        ))
    },
  )
}
```

Idempotent. Every UPDATE is guarded on the current state and ownership. Re-running yields 0-row effects.

### 3.7 Shipping address validation

Shared Zod schema at `apps/web/src/lib/shipping-address-schema.ts`:

```ts
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

Server validates on submit; client form uses the same schema for immediate field-level errors.

### 3.8 Error codes

| Code                      | Outcome                             | UI copy                                                                                            |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `UNAUTHENTICATED`         | Redirect to `/login?next=/checkout` | —                                                                                                  |
| `CHECKOUT_DISABLED`       | No side effects                     | "Checkout is temporarily unavailable."                                                             |
| `EMPTY_CART`              | No side effects                     | "Your cart is empty."                                                                              |
| `INVALID_ADDRESS`         | No side effects                     | Field-level errors                                                                                 |
| `PENDING_CHECKOUT_EXISTS` | Returns existing sessionId          | "You have a checkout in progress. Complete or cancel it before starting again." + link to existing |
| `INVALID_CART`            | No side effects                     | "Some items in your cart are no longer available." + per-line list                                 |
| `OUT_OF_STOCK_RACE`       | Transaction rolled back             | "Stock changed while you were reviewing — please refresh."                                         |
| `VOUCHER_UNAVAILABLE`     | Transaction rolled back             | "Voucher is no longer valid."                                                                      |
| `VOUCHER_RACE`            | Transaction rolled back             | Same as `VOUCHER_UNAVAILABLE`                                                                      |
| `TOTAL_NOT_PAYABLE`       | Transaction rolled back             | "Voucher covers the full order; please remove it or add shipping/another item."                    |
| `PAYMENT_INIT_FAILED`     | Compensation ran; session cancelled | "Payment provider unavailable — please try again."                                                 |

---

## 4. UI surfaces

### 4.1 `/cart` (modify existing)

Stays minimal. Existing client component at `apps/web/src/app/cart/page.tsx` is kept; modifications:

- "Checkout coming soon." footnote replaced with **"Proceed to Checkout"** link → `/checkout`.
- Link is rendered only when `itemCount > 0` AND `hydrated === true`.
- Add one footer line: "Final prices, shipping, discounts, and stock are confirmed at checkout."

No voucher input, no per-store grouping, no shipping calculation, no brand-discount preview on `/cart`.

### 4.2 `/checkout`

Server Component shell at `apps/web/src/app/checkout/page.tsx`:

- Auth check; redirect `/login?next=/checkout` if anonymous.
- Reads `checkout_enabled`; if false, renders a "Checkout is temporarily unavailable" notice instead of the form.
- Renders chrome + a `<CheckoutForm />` client component child.

Client component `apps/web/src/app/checkout/checkout-form.tsx`:

- Reads cart items from localStorage on mount (`useCart` hook).
- Calls `priceCheckoutPreview({ items, voucherId: null })` server action → renders preview.
- Voucher dropdown change → re-calls `priceCheckoutPreview({ items, voucherId })` → re-renders.
- Address form (Zod schema mirrored client-side).
- Pay button: calls `initiateCheckout()`, on success → `window.location.assign(redirectUrl)` to HitPay.

Render structure:

1. **"Review your order"** heading.
2. **Invalid-line banner** (only if `preview.invalidLines.length > 0`) — lists offending items, link back to `/cart`.
3. **Per-store cards** — store name, line items, shipping fee row.
4. **Voucher dropdown:**
   - "No voucher" (default)
   - One entry per available voucher, labelled by type/value/expiry — no `voucher.code` exposed:
     - `RM50.00 off — expires 30 Jun 2026` (fixed_myr)
     - `15% off — expires 30 Jun 2026` (percentage)
     - `RM12.50 off — expires 30 Jun 2026` (random_myr; from `random_resolved_sen`)
   - If multiple labels collide: append ` (#{first8(voucher.id)})`.
   - Helper text: "Applying a voucher disables your brand subscription discount."
5. **Discount preview:**
   - Subtotal: RMX.XX
   - Brand discount (per-store sum, when no voucher): −RMX.XX
   - Voucher applied: −RMX.XX (when voucher selected)
   - Shipping: RMX.XX
   - **Total: RMX.XX**
6. **Shipping address form** (Zod-validated).
7. **`TOTAL_NOT_PAYABLE` inline error** under voucher dropdown when applicable.
8. **"Pay with HitPay"** submit button.

**Pay button disabled when:**

- `items.length === 0`, or
- `preview.invalidLines.length > 0`, or
- preview returns `TOTAL_NOT_PAYABLE`, or
- address form has errors.

Copy under the submit button: "Submitting will revalidate prices and stock before payment."

Preview wrapper: `withTenant(db, { userId: buyer.id, userRole: 'buyer' }, async (tx) => { … })`. RLS permits buyer to read active products/variants/stores, own vouchers, own brand_subscriptions. Not `withPublicRead` (needs buyer context); not `withAdmin` (overprivileged — preview is read-only and must not write an audit row). Preview never writes; if a `SET TRANSACTION READ ONLY` enforcement is added later for belt-and-braces, it's a `withTenant` enhancement and not in scope for this PR.

### 4.3 `/checkout/success`

Route: `apps/web/src/app/checkout/success/page.tsx`.

Server Component shell:

- Reads `?session=<sessionId>`.
- Looks up session under `withTenant(db, { userId: buyer.id, userRole: 'buyer' }, ...)`; if not found / not own → render 404.
- Renders `<SuccessPoller sessionId={sessionId} />` client component.

`<SuccessPoller />`:

- Polls `getCheckoutSessionStatus(sessionId)` every 2s, max 30s.
- On `paid`: clear cart, render success message.
- On `pending_payment` after 30s: "Your payment is still processing — check back shortly."
- On `payment_review_required`: "We need to verify your payment — our team will be in touch."
- On `failed` / `cancelled` / `expired`: `router.replace(\`/checkout/cancelled?session=${sessionId}&reason=${status}\`)`.

The polling component only clears the cart on `paid`. (Note: in PR #31, `paid` is unreachable because `checkout_enabled = false` and PR #32 hasn't shipped. Behaviour is wired so PR #32 unlocks it.)

### 4.4 `/checkout/cancelled`

Route: `apps/web/src/app/checkout/cancelled/page.tsx`.

Server Component shell:

- Reads `?session=<sessionId>` (optional) and `?reason=<reason>` (optional).
- If `sessionId` present: looks up session under `withTenant(db, { userId: buyer.id, userRole: 'buyer' }, ...)`; if not found / not own → ignore (render generic message).
- Renders `<CancelTrigger sessionId={sessionId} />` client component if sessionId is present and status is `pending_payment`.

**No mutation on GET render.** All state changes go through POST.

`<CancelTrigger />`:

- On mount: if `sessionId && initialStatus === 'pending_payment'`, auto-submits `cancelPendingCheckout(sessionId)` via POST server action.
- Renders "Your checkout was cancelled. Your items are still in your cart." (after action completes).
- Defensive: also exposes a "Cancel my checkout" button that calls the same action — visible if auto-cancel hasn't completed within 5s.

Server action `cancelPendingCheckout(sessionId)`:

- Auth check.
- Calls `compensateInitiation(sessionId, buyer.id, 'buyer_cancelled')`.
- Returns `{ ok: true }` regardless of whether compensation was a no-op (it's idempotent).

Cart is **not** cleared by the cancelled flow — buyer keeps items for a retry.

### 4.5 Files added/modified

```
apps/web/src/app/cart/page.tsx                   (modify — proceed-to-checkout link + footnote)
apps/web/src/app/checkout/page.tsx               (new — server component)
apps/web/src/app/checkout/queries.ts             (new — server-side recompute logic shared with actions)
apps/web/src/app/checkout/actions.ts             (new — initiateCheckout, priceCheckoutPreview, cancelPendingCheckout, getCheckoutSessionStatus)
apps/web/src/app/checkout/compensate.ts          (new — compensateInitiation helper)
apps/web/src/app/checkout/checkout-form.tsx      (new — client component)
apps/web/src/app/checkout/success/page.tsx       (new)
apps/web/src/app/checkout/success/poller.tsx     (new — client polling)
apps/web/src/app/checkout/cancelled/page.tsx     (new)
apps/web/src/app/checkout/cancelled/cancel-trigger.tsx (new — client auto-POST)
apps/web/src/lib/shipping-address-schema.ts      (new — shared Zod schema)
apps/web/src/lib/checkout-errors.ts              (new — error code → user copy map)
apps/web/src/lib/cart.tsx                        (modify — clearCart called only from /checkout/success poller; no API change)
```

---

## 5. Background job

### 5.1 Lock-order convention (shared with PR #32)

Initiation creates a new session and operates on existing variants and vouchers; all other paths mutate an existing session. These two access patterns acquire locks differently:

**Initiation (`initiateCheckout`):**

1. Per-buyer advisory transaction lock — `pg_advisory_xact_lock(hashtext('checkout:' || buyerId))`.
2. `product_variants` rows — `FOR UPDATE` in validation; atomic `UPDATE … WHERE stock_count >= qty` in decrement.
3. `vouchers` row — `FOR UPDATE` in validation; atomic conditional `UPDATE` in reservation.
4. INSERTs into `checkout_sessions`, `checkout_session_items`, `checkout_session_stores`, `inventory_reservations`.

**All paths operating on an _existing_ session** (`compensateInitiation`, `cancelPendingCheckout`, `runInventoryReservationExpiryJob`, **and the PR #32 webhook handler**) acquire row locks in this order:

1. `checkout_sessions` row — `SELECT FOR UPDATE`. The expiry job does this jointly with `inventory_reservations` via `FOR UPDATE OF cs, r SKIP LOCKED`.
2. `inventory_reservations` rows.
3. `product_variants` rows — via atomic `UPDATE` (the WHERE clause is the lock).
4. `vouchers` rows.

PR #32 webhook handler **must follow the same order**. Deviating creates deadlocks between the webhook and the expiry job / cancellation paths.

### 5.2 `runInventoryReservationExpiryJob`

File: `apps/api/src/jobs/inventory-reservation-expiry.ts`.

```ts
export async function runInventoryReservationExpiryJob(deps: JobDeps): Promise<void> {
  const { db, log } = deps

  await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "inventory_reservation_expiry_job" },
    async (tx) => {
      // 1. Pull candidate reservations + their session metadata.
      //    Lock both tables in declared order (cs first, then r) via FOR UPDATE OF.
      //    SKIP LOCKED defers to webhook (PR #32) and cancel paths.
      //    LIMIT 500 keeps transaction bounded.
      const candidates = await tx.execute(sql`
        SELECT r.id              AS reservation_id,
               r.variant_id      AS variant_id,
               r.quantity        AS quantity,
               r.checkout_session_id AS session_id,
               cs.status         AS session_status,
               cs.user_id        AS session_user_id
          FROM inventory_reservations r
          INNER JOIN checkout_sessions cs ON cs.id = r.checkout_session_id
         WHERE r.status = 'active'
           AND r.expires_at < now() - interval '5 minutes'
         ORDER BY r.expires_at ASC
         LIMIT 500
         FOR UPDATE OF cs, r SKIP LOCKED
      `)

      const POST_PAYMENT = new Set(["paid", "payment_review_required", "payment_review_resolved"])
      const sessionsTouched = new Map<string, string>() // sessionId -> userId

      for (const c of candidates.rows) {
        if (POST_PAYMENT.has(c.session_status)) continue // never touch post-payment sessions

        // 2. Atomic reservation transition active -> expired
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
        if (released.length === 0) continue // someone else already expired this

        // 3. Restore stock for the released reservation
        await tx
          .update(productVariants)
          .set({ stockCount: sql`stock_count + ${c.quantity}`, updatedAt: sql`now()` })
          .where(eq(productVariants.id, c.variant_id))

        sessionsTouched.set(c.session_id, c.session_user_id)
      }

      // 4. Per touched session: release voucher (ownership-guarded), expire session if still pending
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
            and(
              eq(checkoutSessions.id, sessionId),
              eq(checkoutSessions.status, "pending_payment"), // never overwrite terminal/post-payment
            ),
          )
      }

      // 5. Orphan-session cleanup — guarded by NOT EXISTS so it cannot
      //    cancel a session that still has active reservations or a reserved voucher.
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

Single `withAdmin` transaction per run → one `admin_bypass_audit` row per run.

**Terminal-state preservation:** the session-update at step 4 keeps its `status = 'pending_payment'` guard, so stale `failed` / `cancelled` sessions are never overwritten — only their lingering active reservations and reserved vouchers are cleaned up.

### 5.3 Scheduler registration

```ts
// apps/api/src/scheduler.ts (existing — add one schedule entry)
scheduler.schedule(
  "inventory_reservation_expiry",
  "*/10 * * * *", // every 10 minutes
  () =>
    runInventoryReservationExpiryJob({
      db,
      log: log.child({ job: "inventory_reservation_expiry" }),
    }),
)
```

---

## 6. Test matrix

All integration tests run against the real Postgres test DB (PR #27 fixture pattern). HitPay is stubbed via dependency injection (existing Stage 4 pattern).

### 6.1 `packages/db/tests/cart_checkout.test.ts` — schema & RLS

1. `checkout_sessions` CHECK rejects: voucher_discount > 0 AND brand_discount_total > 0.
2. `checkout_sessions` CHECK rejects: `total_buyer_pays_sen` not equal to the derived expression.
3. `checkout_sessions` CHECK rejects: `total_buyer_pays_sen = 0`.
4. `checkout_sessions` CHECK rejects: `voucher_discount_sen > total_catalog_sen`.
5. `checkout_session_stores` CHECK rejects: `brand_discount_sen > retail_subtotal_sen`.
6. `checkout_session_stores` CHECK rejects: `discounted_subtotal_sen != retail_subtotal_sen - brand_discount_sen`.
7. RLS: buyer reads own `checkout_sessions` under `withTenant`; cannot read another buyer's.
8. RLS: buyer **cannot** INSERT/UPDATE/DELETE `checkout_sessions` under `withTenant` (all three operations denied; no policy matches under buyer-scoped context, even with `user_id = self`). All writes succeed only under `withAdmin`.
   8a. RLS: buyer cannot INSERT/UPDATE/DELETE `checkout_session_items` under `withTenant` (same denial).
   8b. RLS: buyer cannot INSERT/UPDATE/DELETE `checkout_session_stores` under `withTenant` (same denial).
   8c. RLS: staff (`bomy_admin` / `bomy_ops` / `bomy_finance` role via `withTenant`) can SELECT rows in all three checkout tables but cannot INSERT/UPDATE/DELETE without admin bypass.
9. RLS: `inventory_reservations` not readable under `withTenant` for `buyer` role; readable under `withTenant` for staff roles; not writable under any `withTenant` context.
10. RLS: `inventory_reservations` readable and writable under `withAdmin`.
11. `vouchers_available_user_idx` exists (schema assertion via `pg_indexes`).
12. `stores.flat_shipping_fee_sen` CHECK rejects negative values.
13. `vouchers.redeemed_order_id` column has been dropped.

### 6.2 `apps/web/tests/checkout/initiate.test.ts` — server action paths

14. `checkout_enabled = false` → returns `CHECKOUT_DISABLED`; no rows written in any of the new tables (table-count snapshot before/after).
15. Happy path: session + items + stores + reservations inserted; stock decremented per variant; voucher (if any) reserved; `admin_bypass_audit` row written with reason `checkout_initiation:{sessionId}`; HitPay `createPaymentRequest` called once with correct `amount`, `reference_number = sessionId`, redirect/cancel/webhook URLs; `psp_payment_request_id` and `psp_payment_url` stored on the session.
16. Empty cart → `EMPTY_CART`.
17. Invalid cart line (variant inactive) → `INVALID_CART`; no side effects.
18. Invalid cart line (product archived) → `INVALID_CART`.
19. Invalid cart line (store suspended) → `INVALID_CART`.
20. Insufficient stock at validation time → `INVALID_CART`.
21. Address validation fail → `INVALID_ADDRESS`.
22. Pending session exists for buyer → `PENDING_CHECKOUT_EXISTS` returns existing sessionId.
23. `TOTAL_NOT_PAYABLE`: voucher value ≥ catalog total with zero shipping → error returned; no rows written.
24. Stock race: two concurrent `initiateCheckout` calls for last unit → one succeeds, other rolls back with `OUT_OF_STOCK_RACE`; stock ends at 0; one session in `pending_payment`, no orphans.
25. Voucher race: two concurrent calls using same voucher → one wins, other rolls back with `VOUCHER_RACE`.
26. HitPay `createPaymentRequest` throws → `compensateInitiation` runs; session = `cancelled`; reservations = `released`; stock restored; voucher released; audit rows for both initiation and compensation.
27. PSP reference persistence (Transaction 2) fails → `compensateInitiation` runs same way; no orphaned reservations.

### 6.3 `apps/web/tests/checkout/preview.test.ts` — price recompute

28. Preview ignores client-supplied totals; computes solely from DB rows.
29. Brand discount applies when buyer has active `brand_subscriptions` row; uses snapshotted `discount_pct`.
30. Brand discount = 0 when voucher selected.
31. Brand discount = 0 when sub `status = 'pending'`.
32. Brand discount = 0 when sub `status = 'cancelled'`.
33. Brand discount = 0 when `period_end < now()`.
34. Voucher `fixed_myr`: capped at catalog total.
35. Voucher `random_myr`: uses `random_resolved_sen`, capped at catalog total.
36. Voucher `percentage`: floor allocation.
37. Per-store voucher allocation: proportional, last-store-absorbs, `sum(voucher_contribution_sen) = voucher_discount_sen` exactly.
38. Multi-store cart: shipping summed across stores; brand discount applies only to matching stores.
39. Preview with another buyer's voucher id (forced) → voucher not returned in dropdown options; on submit → `VOUCHER_UNAVAILABLE`.

### 6.4 `apps/web/tests/checkout/cancel.test.ts` — cancellation

40. `cancelPendingCheckout` from `/checkout/cancelled` POST: session `pending_payment` → `cancelled`; reservations released; stock restored; voucher released; second call is a no-op (idempotent).
41. `compensateInitiation` no-op when `session.status = 'paid'` (PR #32 race scenario — must not undo a successful payment).
42. `compensateInitiation` ownership guard: wrong `buyerId` → no-op; session/reservations/voucher untouched.

### 6.5 `apps/api/tests/jobs/inventory-reservation-expiry.test.ts`

43. Active reservation past grace → reservation `expired`, stock restored, voucher released, session `expired`, audit row written.
44. Active reservation still within grace → skipped.
45. Active reservation but `session.status = 'paid'` → skipped: reservation NOT expired, stock NOT restored, voucher NOT released, session untouched.
46. Active reservation but `session.status = 'payment_review_required'` → same skip behaviour.
47. Stale `failed` session with active reservation past grace → reservation status set to `expired`, stock restored, voucher released, **`session.status` stays `failed`** (the session-update step's `status = 'pending_payment'` guard fails, so terminal status is preserved).
48. Stale `cancelled` session with active reservation past grace → reservation status set to `expired`, stock restored, voucher released, **`session.status` stays `cancelled`** (same guard preserves terminal status).
49. Orphan session (`pending_payment`, no `psp_payment_request_id`, past grace, no active reservations, no reserved voucher) → cancelled.
50. Orphan-guard: session has `pending_payment` + no PSP id + past grace **but still has active reservations** → NOT cancelled by orphan pass (will be cleaned next run after candidate pass releases the reservations).
51. Two concurrent job runs (test uses two transactions with `SKIP LOCKED`) → both succeed without overlap; result is consistent and idempotent; aggregate state matches single-run.
52. Batch size: 600 candidates, single run processes exactly 500 (oldest first); next run processes remaining 100.

---

## 7. Observability

- **Pino logs (per request, `/checkout` action):** `path`, `userId`, `sessionId` (after generation), `itemsCount`, `voucherId`, `total_buyer_pays_sen`, `error` (if any).
- **Pino logs (per compensation):** `event: checkout_compensation`, `reason`, `sessionId`, `released_reservations`, `voucher_released: boolean`.
- **Pino logs (per expiry job run):** counts from step 5.
- **OTel spans** around `initiateCheckout`, `priceCheckoutPreview`, `compensateInitiation`, `cancelPendingCheckout`, `runInventoryReservationExpiryJob`. Attributes include `sessionId`, `userId`, `outcome`.
- **No new alerts in PR #31.** `payment_review_required` and ops-critical alerting are wired in PR #32 alongside webhook fan-out.

---

## 8. Environment variables

No new environment variables. Existing `WEB_BASE_URL` and `API_BASE_URL` are used for HitPay redirect/cancel/webhook URLs. `HITPAY_API_KEY` already exists from Stage 4.

---

## 9. Hard constraints (must not violate)

1. **Monetary values are `bigint` sen.** Never floats. JS literals use `bigint` (`2999n`); JSON over the wire uses `number` for sums under 2^53 only when safe — never trust a client `total` value.
2. **Client cart state is advisory only.** Server recomputes every price, stock count, brand discount, voucher value, and shipping fee from the database inside the transaction.
3. **Single transaction for Phase 1.** All reservations + stock decrements + voucher reservation + session/items/stores inserts happen under one `withAdmin` envelope. One audit row per initiation.
4. **`checkout_enabled` is the master gate.** When `false`, the server action returns `CHECKOUT_DISABLED` with no side effects. The flag stays `false` until PR #32 webhook is live and smoke-tested.
5. **Compensation is idempotent and ownership-guarded.** Every UPDATE checks current state (`status = 'pending_payment'`) and ownership (`user_id = buyerId`). Re-runs are no-ops.
6. **Lock order is fixed across all paths operating on an existing session:** `checkout_sessions` → `inventory_reservations` → `product_variants` → `vouchers`. Initiation has a different access pattern (see §5.1). PR #32 webhook must follow the existing-session order.
7. **Terminal-state preservation in the expiry job.** Sessions in `failed` or `cancelled` have their lingering reservations and vouchers cleaned up, but their status is never overwritten.
8. **No mutation on GET render.** All state changes happen via POST server actions. `/checkout/cancelled` renders a client component that explicitly calls a POST action.
9. **No `withAdmin` without durable audit row** (PR #26 contract). `initiateCheckout`, `compensateInitiation`, `runInventoryReservationExpiryJob` all use named reasons.
10. **RLS FORCE on all new tables** from migration zero. WITH CHECK on all INSERT/UPDATE policies. Default-deny.
11. **PSP-agnostic core; HitPay only in PR #31.** `psp_provider` enum has both values; only `'hitpay'` is ever inserted by this PR's code.

---

## 10. Open verification items (resolve in implementation, not blocking spec)

1. Confirm Drizzle's `.for('update', { of: [...], skipLocked: true })` supports the multi-table `OF` clause; fall back to raw `sql\`\`` template if not.
2. `withTenant` (current signature `(db, { userId, userRole, sellerId? }, fn)`) does **not** accept a `readOnly` option. Preview is wired to use `withTenant` as-is; it's read-only by convention. If we ever want belt-and-braces `SET TRANSACTION READ ONLY`, it's a follow-up to `packages/db/src/tenant.ts`, not in PR #31.
3. Confirm `SYSTEM_ACTOR` constant location (PR #26) — import path stays stable.
4. `senToMyr` helper to convert `bigint` sen → 2dp string for HitPay (e.g. `2999n → "29.99"`). Place under `apps/web/src/lib/money.ts` if it does not already exist.
