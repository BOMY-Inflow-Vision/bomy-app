# Stripe as a Second PSP (alongside HitPay) — Design

**Date:** 2026-11-24
**Owner:** Charlie · **Author:** Andy
**Status:** Draft for review (PR 0 — design only, no code)
**Related:** GAPS.md #2 (money pipeline never run live), GAPS.md #14 (PSP coupling inventory),
`2026-05-17-pr32-order-webhook-ledger-design.md`, `2026-04-30-membership-subscriptions-design.md`,
`2026-06-23-duplicate-charge-reconciliation-design.md`, runbook `docs/runbooks/checkout-enabled-flip.md`.

---

## 1. Goal, non-goals, invariants

**Goal.** Let BOMY take payments through **Stripe** (Malaysian account, MYR) for every money flow —
order checkout, brand subscriptions, platform membership (recurring) — while keeping HitPay fully
working, with an admin Config setting that picks the **one** provider used for **new** payments.

**Non-goals.**

- Buyer-facing PSP choice. The buyer never picks between Stripe and HitPay.
- Deleting or rewriting HitPay. `packages/hitpay`, `/webhooks/hitpay` and all HitPay rows stay.
- Moving existing HitPay recurring memberships to Stripe. They keep renewing on HitPay.
- USD charging. The schema allows `USD`, but no code path writes it today and Stripe Malaysia
  settles in MYR only (§8). Stripe ships **MYR only**.
- Automated seller payouts (Stripe Connect transfers). Payouts stay manual (`order_payouts.manual_ref`).
  **But see Risk #1: Stripe's terms may force Connect.**
- Order refunds. No order refund flow exists today (`orders.refund_*` columns are reserved and unused).
- Flipping `checkout_enabled`.

**Invariants (each PR's reviewer checks all three).**

1. **Both webhook endpoints are live at all times.** `POST /webhooks/hitpay` and `POST /webhooks/stripe`
   both stay registered whatever `active_psp` is set to. The active provider only affects _new_
   payment creation, never inbound processing.
2. **Every payment row records its provider.** That means `checkout_sessions.psp_provider` (exists),
   plus new `psp_provider` columns on `member_subscriptions`, `brand_subscriptions` and
   `duplicate_charges`. The value is pinned when the row is created. Every later call (webhook
   correlation, cancel, refund) reads the provider **from the row**, never from `active_psp`.
3. **`checkout_enabled` is never touched by code.** It stays `false`. Flipping it remains the
   operational runbook step, after a live smoke on the _active_ provider.

---

## 2. Current-state map — what is PSP-neutral and what is HitPay-specific

| Area                          | File(s)                                                                                                                                                                                                                                                                                                                                   | State                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Provider enum                 | `packages/db/src/types.ts:95` `PSP_PROVIDERS = ["hitpay","stripe"]`; PG enum `psp_provider` (0011)                                                                                                                                                                                                                                        | **Neutral.** `stripe` is reserved.                                                                                                       |
| Checkout session              | `packages/db/src/schema/checkout_sessions.ts` — `psp_provider` (default `hitpay`), `psp_payment_request_id`, `psp_payment_id`, `psp_payment_url`, `psp_fee_sen`                                                                                                                                                                           | **Neutral schema.** The writer hard-codes `pspProvider: "hitpay"` (`apps/web/src/app/checkout/actions.ts:353`).                          |
| Orders / per-store split      | `orders.psp_fee_allocated_sen`, `checkout_session_stores.psp_fee_allocated_sen`; journal CHECK `orders_journal_balance`                                                                                                                                                                                                                   | **Neutral.**                                                                                                                             |
| Order fan-out + commission    | `apps/api/src/webhooks/hitpay/{order-fanout,commission,failure-release,park-review}.ts`                                                                                                                                                                                                                                                   | **Logic is neutral.** Inputs are HitPay strings (`amountStr`/`feesStr`, `parseSen`), and log copy says "hitpay".                         |
| Webhook idempotency           | `processed_webhook_events (psp_provider, psp_event_id)` unique; `webhooks/hitpay/idempotency.ts` (`EventIdentity.pspProvider: "hitpay"` literal)                                                                                                                                                                                          | **Table is neutral.** The type is pinned to HitPay.                                                                                      |
| Order ledger keys             | `checkout:${session.id}:credit`, `order:${order.id}:seller_payout`, `order:${order.id}:processing_fee` (`order-fanout.ts:525-555`)                                                                                                                                                                                                        | **Neutral** (keyed on BOMY uuids).                                                                                                       |
| Payouts                       | `order_payouts.psp_provider` (nullable), `psp_transfer_id`                                                                                                                                                                                                                                                                                | **Neutral**, manual today.                                                                                                               |
| Membership                    | `member_subscriptions.hitpay_recurring_id`, `hitpay_payment_id` (0003)                                                                                                                                                                                                                                                                    | **HitPay-named.**                                                                                                                        |
| Brand subscription            | `brand_subscriptions.hitpay_payment_request_id` (0004, unique partial idx), `hitpay_payment_id`, `hitpay_fee_sen`; CHECK `brand_subscriptions_split_chk` requires `hitpay_fee_sen IS NOT NULL AND commission + payout + hitpay_fee_sen = price` when active (0003:112)                                                                    | **HitPay-named, and the CHECK names the column.**                                                                                        |
| Duplicate charges             | `duplicate_charges.hitpay_payment_id NOT NULL` (unique), `hitpay_refund_id` (unique partial) (0016)                                                                                                                                                                                                                                       | **HitPay-named.**                                                                                                                        |
| Subscription ledger keys      | `membership:recurring:${paymentId}:credit`; `brand_sub:${subId}:${paymentId}:{credit,debit:payout,debit:fee}`; `dup_charge:${paymentId}:{credit,debit}`; `refund:${paymentId}[:${refundId}]:${subId}:debit` (`apps/api/src/routes/webhooks/hitpay.ts`)                                                                                    | **Embed raw HitPay ids**, not namespaced.                                                                                                |
| PSP client                    | `packages/hitpay` (`HitPayClient`: createPaymentRequest, createRecurringBilling, cancelRecurringBilling, createRefund, createTransfer; `verifyWebhookSignature` HMAC)                                                                                                                                                                     | **HitPay only.**                                                                                                                         |
| Webhook route                 | `apps/api/src/routes/webhooks/hitpay.ts` (raw-body parser, routes by `Hitpay-Event-Type`, membership / order→brand fall-through / refund)                                                                                                                                                                                                 | **HitPay only.**                                                                                                                         |
| Payments gate                 | `apps/web/src/lib/payments-enabled.ts` — `paymentsEnabled()` = `HITPAY_API_KEY && HITPAY_API_URL`                                                                                                                                                                                                                                         | **HitPay env sniff.** Gates `/membership` and `/brands/[slug]/subscribe` (**not** order checkout, which is gated by `checkout_enabled`). |
| Outbound HitPay callers       | web: `checkout/actions.ts`, `(marketing)/membership/actions.ts` (join, cancel), `brands/[slug]/subscribe/actions.ts`; admin: `memberships/actions.ts` (cancel), `payouts/reconciliation/actions.ts` (duplicate refund)                                                                                                                    | Each builds its own `HitPayClient`.                                                                                                      |
| Readers of `hitpay_*` columns | web `membership/success/page.tsx`, `lib/membership.ts` (`isPendingAbandoned`); admin `memberships/page.tsx`, `brand-subscriptions/page.tsx`, `payouts/reconciliation/page.tsx`; api `jobs/expire-abandoned-pending-memberships.ts`                                                                                                        | Must move to the `psp_*` columns.                                                                                                        |
| Jobs                          | `apps/api/src/scheduler.ts`: renewal-notification, brand-subscription-expiry (also lapses memberships), member-subscription-expiry (cancelled + abandoned-pending), inventory-reservation-expiry                                                                                                                                          | **Neutral** except the abandoned-pending filter on `hitpay_payment_id IS NULL`.                                                          |
| Config                        | `platform_config` (staff-only RLS); admin `/config` page is **read-only** (`apps/admin/src/app/config/page.tsx`). Writers: `ops:platform-config:set` (`packages/db/scripts/ops/platform-config-flip-core.ts`: `FOR UPDATE` + `platform_config_audit` row) and `updateRenewalNotificationDays` (admin, **no** `platform_config_audit` row) | The write pattern to copy is `platform-config-flip-core.ts`.                                                                             |

**Facts from the investigation that change the brief.**

- **Brand subscriptions are not recurring.** They are prepaid 3/6/12-month terms bought with a
  one-off payment request. `brand-subscription-expiry` just expires them at `period_end`, and nothing
  renews them. On Stripe they are a one-off Checkout payment, not a Billing subscription. Only the
  **platform membership** is recurring.
- **Memberships book no PSP fee.** The membership activation credits the gross amount to
  `revenue:platform_subscription` and ignores HitPay's fee (`hitpay.ts:413`). Only orders and brand
  subscriptions are net-of-fee.
- **Admin is on Vercel, not Railway.** It moved on 2026-07-21 (`docs/runbooks/admin-vercel-migration.md`).
  `app/CLAUDE.md` still says Railway. Services: web (Vercel), admin (Vercel), api (Railway).
- **A late order payment on an expired or cancelled session is only logged.** `order-fanout.ts`
  Step F logs and runs a consistency check. Because `duplicate_charges` only allows subscription
  types, no liability row is created. This is an existing HitPay gap; Stripe narrows it (§5.4).

---

## 3. Target architecture

### 3.1 Package layout

```
packages/psp/                     NEW — provider-neutral seam (no DB dependency)
  src/types.ts                    PaymentProvider, inputs/outputs, NormalizedPspEvent
  src/registry.ts                 getProvider(id), lazy per-provider singletons from env
  src/ledger-keys.ts              ledgerKey(provider, ...parts) — legacy format for hitpay
  src/money.ts                    senToMajorString (moved from web), assertSafeMinor(n): bigint
  src/hitpay/provider.ts          HitPayProvider — wraps @bomy/hitpay (unchanged package)
  src/stripe/provider.ts          StripeProvider — official `stripe` SDK, pinned apiVersion
  src/stripe/webhook.ts           verifyAndParseStripeWebhook(raw, header, secrets[]) → NormalizedPspEvent[]
  tests/fixtures/stripe/*.json    recorded event payloads (test mode)
packages/hitpay/                  UNCHANGED
apps/api/src/routes/webhooks/stripe.ts      NEW route (own raw-body parser, own rate-limit group)
apps/api/src/webhooks/core/                 NEW — domain functions extracted from hitpay.ts as each
                                            Stripe flow lands (activateBrandSubscription, activateMembership,
                                            renewMembership, recordDuplicateCharge, recordRefund)
apps/api/src/jobs/psp-fee-settlement.ts     NEW sweep (Stripe async fee, §6)
apps/web/src/lib/active-psp.ts              NEW getActivePsp() + paymentsEnabled() replacement
```

`packages/psp` uses the official `stripe` SDK rather than a hand-rolled fetch client. The SDK gives
signature verification, `Idempotency-Key` handling and typed objects. **Pin `apiVersion`** in one
constant: invoice and subscription shapes changed in the 2025 API versions, and §7 depends on them.
Add `@bomy/psp` to `transpilePackages` in web and admin, matching `@bomy/hitpay`.

### 3.2 `PaymentProvider` interface (outbound)

```ts
type PspProvider = "hitpay" | "stripe" // from @bomy/db types
type Kind = "order" | "brand_subscription" | "member_subscription"

interface PaymentProvider {
  readonly id: PspProvider
  /** Env present and safe for this deployment (see §10 test-key guard). Fail-closed. */
  isConfigured(): boolean

  /** One-off hosted checkout: orders + brand subs. */
  createOneTimeCheckout(i: {
    kind: "order" | "brand_subscription"
    bomyRefId: string // checkout_sessions.id / brand_subscriptions.id
    amountSen: bigint
    currency: "MYR"
    customerEmail: string
    description: string
    successUrl: string
    cancelUrl: string
    expiresAt: Date
    idempotencyKey: string
  }): Promise<{ pspRequestId: string; redirectUrl: string }>

  /** Close an unpaid hosted checkout. Returns "already_paid" if it completed first. */
  expireCheckout(pspRequestId: string): Promise<"expired" | "already_paid" | "unsupported">

  /** Recurring membership checkout. */
  createRecurringCheckout(i: {
    kind: "member_subscription"
    bomyRefId: string
    amountSen: bigint
    currency: "MYR"
    interval: "year"
    customerEmail: string
    successUrl: string
    cancelUrl: string
    startDate: Date
    idempotencyKey: string
  }): Promise<{ pspRequestId: string; pspRecurringId: string | null; redirectUrl: string }>

  cancelRecurring(pspRecurringId: string, o: { atPeriodEnd: boolean }): Promise<void>

  refund(i: {
    pspPaymentId: string
    amountSen: bigint
    reason: string
    idempotencyKey: string
  }): Promise<{ pspRefundId: string; status: "pending" | "succeeded" | "failed" }>

  /** Fee actually charged; "pending" while Stripe's async capture has no balance txn yet. */
  getPaymentFee(
    pspPaymentId: string,
  ): Promise<
    { status: "known"; feeSen: bigint; netSen: bigint; currency: "MYR" } | { status: "pending" }
  >
}
```

What the HitPay adapter does:

- `createRecurringCheckout` returns `pspRecurringId` straight away.
- `expireCheckout` returns `"unsupported"`, which is today's behaviour.
- `getPaymentFee` is never called for HitPay, because the fee comes in the webhook. It throws.

### 3.3 Normalized inbound event (Stripe route only)

```ts
type NormalizedPspEvent =
  | {
      type: "checkout.paid"
      eventId: string
      kind: Kind
      bomyRefId: string
      pspRequestId: string
      pspPaymentId: string
      amountSen: bigint
      currency: "MYR"
    }
  | {
      type: "checkout.failed" | "checkout.expired"
      eventId: string
      kind: Kind
      bomyRefId: string
      pspRequestId: string
    }
  | { type: "fee.available"; eventId: string; pspPaymentId: string } // charge.updated
  | {
      type: "recurring.paid"
      eventId: string
      bomyRefId: string
      pspRecurringId: string
      pspCustomerId: string
      pspInvoiceId: string
      pspPaymentId: string
      amountSen: bigint
      billingReason: "create" | "cycle"
      periodStart: Date
      periodEnd: Date
    }
  | {
      type: "recurring.payment_failed"
      eventId: string
      pspRecurringId: string
      pspInvoiceId: string
    }
  | { type: "recurring.ended"; eventId: string; pspRecurringId: string; endedAt: Date }
  | {
      type: "refund.updated"
      eventId: string
      pspPaymentId: string
      pspRefundId: string
      amountSen: bigint
      status: "pending" | "succeeded" | "failed"
    }
  | {
      type: "dispute.opened" | "dispute.closed"
      eventId: string
      pspPaymentId: string
      amountSen: bigint
      status: string
    }
  | { type: "ignored"; eventId: string; stripeType: string }
```

**The HitPay route is not rewritten onto this type.** It is ~990 lines of tested, money-moving
code. Instead:

- Domain functions are extracted into `apps/api/src/webhooks/core/` **when the Stripe caller for
  that flow lands** (PRs 4–7). Each one takes `(tx, provider, parsed values in bigint)`.
- The HitPay route keeps its own parsing (`parseSen`, park-on-unparseable) and calls the same core.

This "extract when the second caller arrives" approach keeps PR 2 behaviour-neutral.

### 3.4 Resolving the active provider

- A new `platform_config` key `active_psp` holds a JSON string, either `"hitpay"` or `"stripe"`.
  It is seeded as `"hitpay"` in 0039.
- `getActivePsp(): Promise<PspProvider | null>` lives in `apps/web/src/lib/active-psp.ts`. It reads
  the key the same way `readCheckoutEnabled()` does (`withAdmin`) and is wrapped in React `cache()`,
  so there is one read per request. As built in PR 3, `readPaymentFlags()` reads `active_psp` and
  `subscriptions_enabled` in that one `withAdmin` call.
- **There is no cross-request cache.** Vercel instances are short-lived, and a switch should take
  effect on the next request. An unknown or missing value fails closed: `paymentsEnabled()` returns
  false.
  - Next PR (migration 0041, Opus; deferred from PR 3, tracked follow-up): add an RLS policy `platform_config_public_flags_read FOR SELECT USING (key IN ('checkout_enabled','active_psp','subscriptions_enabled'))`
    so these reads can use `withPublicRead` and stop writing an `admin_bypass_audit` row on every
    page view. It reduces audit-table noise, and it lets the brand storefront gate its
    "Subscription plans" link without an audited read.
- `paymentsEnabled()` becomes `async paymentsEnabled(): Promise<boolean>`. As built in PR 3 it is
  `subscriptions_enabled === true && getProvider(await getActivePsp()).isConfigured()` (§13
  decision 3: the flag is enforced from PR 3). Callers: every entry point that starts a NEW
  membership or brand subscription (the membership and brand-subscribe pages and actions, the account
  Renew link). The brand storefront shows a plain "Subscription plans" link with **no** flag read,
  because a read there would write an `admin_bypass_audit` row on every public view; the plans page
  shows the closed state. **Gate that link once 0041** (the public-flag read policy above, next PR)
  supplies a read-only lookup.
- Order checkout uses `orderCheckoutPsp()` (active provider configured, independent of
  `subscriptions_enabled`), shared by the `/checkout` page and `initiateCheckout` so the page never
  looks open while the action refuses. `checkout_enabled` stays the order gate and is checked first.
- **The provider is pinned at creation.** `initiateCheckout`, `joinMembership` and
  `subscribeToBrand` resolve the provider once and write it into the row's `psp_provider` before
  calling out.
- **What happens on a switch while payments are in flight:**
  - Open sessions and pending rows finish on their pinned provider. That provider's webhook is still
    live (Invariant 1).
  - Cancels and refunds use `row.psp_provider`.
  - A buyer who abandons a HitPay checkout and starts over after the switch gets a Stripe checkout.
    If the old HitPay checkout is then paid late, that is the existing duplicate-charge path.
  - **Both providers' credentials must stay configured as long as any of their rows can still move
    money** (pending sessions, recurring memberships, refundable duplicates). The admin switch shows
    a warning saying so.
- **Admin switch (PR 3):**
  - The read-only `/config` page gets a "Payment provider" card with a server action
    `setActivePsp(next)`, limited to `requireAdminId({ roles: ["bomy_admin", "bomy_finance"] })` (owner decision, §13; no two-person approval).
  - Inside `withAdmin`, the action re-reads the actor's role from `users` and holds that row
    `FOR SHARE`, then does `SELECT … FOR UPDATE` on the config row → `UPDATE` →
    `INSERT platform_config_audit` (old→new), copying `platform-config-flip-core.ts`. Lock order is
    always users → platform_config, so a demotion racing the switch is refused or serialised after
    it, with no deadlock.
  - It only offers a provider that is configured on admin (admin needs its keys to cancel and
    refund). Switching to a **dormant** HitPay is the audited ops CLI instead, and only after the
    on/off flags are off when the intent is to stop payments (§11 Kill switch).
  - The ops CLI (`ops:platform-config:set`) applies the same role rule to `active_psp`
    (`bomy_admin` + `bomy_finance`, value `"hitpay"` or `"stripe"`), with the same in-transaction
    role lock, but no credential check.
  - It never touches `checkout_enabled`.
  - The admin app cannot see web's env, so the card links to `GET /ready` on api, which is extended
    to report `{ hitpay: configured, stripe: configured, stripeLivemode }`. Web fails closed if the
    selected provider is not configured there.

### 3.5 Where provider ids live

| Concept                     | HitPay value                | Stripe value            | Column                                                                                                                                 |
| --------------------------- | --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted checkout / request   | payment_request id          | Checkout Session `cs_…` | `checkout_sessions.psp_payment_request_id`; `brand_subscriptions.psp_payment_request_id`; `member_subscriptions.psp_checkout_id` (new) |
| Redirect URL                | request url                 | `session.url`           | `checkout_sessions.psp_payment_url` (other flows don't persist it)                                                                     |
| Payment (refundable handle) | payment_id                  | PaymentIntent `pi_…`    | `*.psp_payment_id`                                                                                                                     |
| Recurring                   | recurring_billing id        | Subscription `sub_…`    | `member_subscriptions.psp_recurring_id`                                                                                                |
| Customer                    | —                           | `cus_…`                 | `member_subscriptions.psp_customer_id` (new)                                                                                           |
| Renewal invoice             | —                           | `in_…`                  | ledger idempotency key only                                                                                                            |
| Refund                      | refund id                   | `re_…`                  | `duplicate_charges.psp_refund_id`                                                                                                      |
| Webhook event               | `Hitpay-Event-Id` / derived | `evt_…`                 | `processed_webhook_events.psp_event_id`                                                                                                |

Stripe metadata on every object we create: `bomy_kind`, `bomy_ref_id`, `bomy_env`. Also set
`client_reference_id = bomy_ref_id` on Checkout Sessions, and `subscription_data.metadata` on
membership checkouts. Correlation always re-reads the row by stored id. Metadata is used only for
routing and for the case where an invoice arrives before `checkout.session.completed` (§7).

---

## 4. Data model changes

### 4.1 Recommendation: additive parallel columns (expand now, contract later). Do not rename.

**Why a rename is unsafe here.** A rename changes code and schema together across three deploy
targets that cannot switch atomically: web and admin on Vercel, api on Railway, plus a migration
applied to Neon by hand. Any old instance still querying `hitpay_payment_id` gets a 500. That
includes the HitPay webhook during a live renewal, which turns into retries and alerts. The
`brand_subscriptions_split_chk` CHECK and two unique indexes name the old columns, so a rename also
rewrites constraints in the same step.

**Why additive is safe.**

- `ADD COLUMN … NULL` and `ADD COLUMN … NOT NULL DEFAULT 'hitpay'` are metadata-only on PG 16.
- RLS policies are row predicates and do not reference these columns.
- `bomy_app` grants are table-level (`GRANT SELECT, INSERT, UPDATE[, DELETE] ON "<table>"`,
  `0027`/`policies.sql:465-511`), so new columns are covered with no grant change.
- The tables are small pre-launch, so the backfill `UPDATE`s are trivial.
- Old code keeps working because it never sees the new columns.

**Transition rule (until a later "contract" PR after the HitPay decision):**

- **HitPay code dual-writes** `hitpay_*` **and** `psp_*`. That keeps a code rollback safe, because
  old code still finds its columns.
- **Stripe code writes only `psp_*`.**
- **Shared readers** (pages, jobs, abandon CAS) read `psp_*`.
- **The HitPay webhook keeps correlating on `hitpay_*`.** It is HitPay-specific and dual-write keeps
  those columns populated.
- PR 2 ships **0040**, which re-runs the idempotent backfill to catch rows written between applying
  0039 and deploying PR 2.

### 4.2 Migration `0039_psp_provider_columns.sql` (PR 1)

**`member_subscriptions`**

```sql
ALTER TABLE member_subscriptions
  ADD COLUMN psp_provider     psp_provider NOT NULL DEFAULT 'hitpay',
  ADD COLUMN psp_recurring_id text,
  ADD COLUMN psp_payment_id   text,
  ADD COLUMN psp_checkout_id  text,
  ADD COLUMN psp_customer_id  text;
UPDATE member_subscriptions SET psp_recurring_id = hitpay_recurring_id,
       psp_payment_id = hitpay_payment_id
 WHERE psp_recurring_id IS NULL AND psp_payment_id IS NULL;
CREATE INDEX member_subscriptions_psp_recurring_idx ON member_subscriptions (psp_provider, psp_recurring_id)
  WHERE psp_recurring_id IS NOT NULL;
CREATE UNIQUE INDEX member_subscriptions_psp_checkout_unique_idx ON member_subscriptions (psp_provider, psp_checkout_id)
  WHERE psp_checkout_id IS NOT NULL;
```

The index on `psp_recurring_id` is not unique, because renewals share the recurring id across rows
(see `hitpay.ts:267`).

**`brand_subscriptions`**

```sql
ALTER TABLE brand_subscriptions
  ADD COLUMN psp_provider           psp_provider NOT NULL DEFAULT 'hitpay',
  ADD COLUMN psp_payment_request_id text,
  ADD COLUMN psp_payment_id         text,
  ADD COLUMN psp_fee_sen            bigint,
  ADD COLUMN psp_paid_at            timestamptz;            -- Stripe: paid, fee not yet known (§6)
UPDATE … SET psp_payment_request_id = hitpay_payment_request_id, psp_payment_id = hitpay_payment_id,
             psp_fee_sen = hitpay_fee_sen;
CREATE UNIQUE INDEX brand_subscriptions_psp_request_unique_idx
  ON brand_subscriptions (psp_provider, psp_payment_request_id) WHERE psp_payment_request_id IS NOT NULL;
-- Replace the CHECK that names hitpay_fee_sen with one valid for old AND new writers:
ALTER TABLE brand_subscriptions DROP CONSTRAINT brand_subscriptions_split_chk;
ALTER TABLE brand_subscriptions ADD CONSTRAINT brand_subscriptions_split_chk CHECK (
  status <> 'active' OR (
    COALESCE(psp_fee_sen, hitpay_fee_sen) IS NOT NULL
    AND bomy_commission_sen + brand_payout_sen + COALESCE(psp_fee_sen, hitpay_fee_sen) = price_myr_sen)) NOT VALID;
ALTER TABLE brand_subscriptions VALIDATE CONSTRAINT brand_subscriptions_split_chk;

-- Keep the two fee columns from drifting while HitPay code writes both.
ALTER TABLE brand_subscriptions ADD CONSTRAINT brand_subscriptions_fee_sync_chk CHECK (
  psp_fee_sen IS NULL OR hitpay_fee_sen IS NULL OR psp_fee_sen = hitpay_fee_sen) NOT VALID;
ALTER TABLE brand_subscriptions VALIDATE CONSTRAINT brand_subscriptions_fee_sync_chk;
```

**`psp_provider` default risk.** `NOT NULL DEFAULT 'hitpay'` means a Stripe insert that forgets to set
the provider is silently recorded as HitPay, and later cancels and refunds would go to the wrong
provider. Every Stripe insert in PRs 4–6 gets a test asserting `psp_provider = 'stripe'`, and the
contract PR drops the default.

The `COALESCE` matters during the deploy window. Old HitPay code, which writes only `hitpay_fee_sen`,
passes the CHECK. New code writes `psp_fee_sen`, and HitPay code also writes `hitpay_fee_sen`.

**`duplicate_charges`**

```sql
ALTER TABLE duplicate_charges
  ADD COLUMN psp_provider   psp_provider NOT NULL DEFAULT 'hitpay',
  ADD COLUMN psp_payment_id text,
  ADD COLUMN psp_refund_id  text,
  ADD COLUMN psp_fee_sen    bigint,                          -- Stripe keeps fees on refund (§9)
  ALTER COLUMN hitpay_payment_id DROP NOT NULL;
UPDATE … SET psp_payment_id = hitpay_payment_id, psp_refund_id = hitpay_refund_id;
CREATE UNIQUE INDEX duplicate_charges_psp_payment_unique_idx ON duplicate_charges (psp_provider, psp_payment_id)
  WHERE psp_payment_id IS NOT NULL;
CREATE UNIQUE INDEX duplicate_charges_psp_refund_unique_idx ON duplicate_charges (psp_provider, psp_refund_id)
  WHERE psp_refund_id IS NOT NULL;
ALTER TABLE duplicate_charges ADD CONSTRAINT duplicate_charges_payment_ref_chk
  CHECK (hitpay_payment_id IS NOT NULL OR psp_payment_id IS NOT NULL);
```

`psp_payment_id` becomes `NOT NULL` only in the contract PR, because old code inserts without it.
`recordDuplicateCharge`'s `onConflictDoNothing` target moves to the new partial index (Drizzle
`target` plus `where`).

**`checkout_sessions`**

```sql
ALTER TABLE checkout_sessions ADD COLUMN psp_paid_at timestamptz;   -- Stripe: paid, awaiting fee (§6)
ALTER TABLE checkout_sessions ADD COLUMN psp_async_pending_since timestamptz;   -- Stripe: completed but unpaid, async method (§6.1)
ALTER TABLE checkout_sessions DROP CONSTRAINT checkout_sessions_payment_review_reason_chk;
ALTER TABLE checkout_sessions ADD CONSTRAINT checkout_sessions_payment_review_reason_chk CHECK (
  payment_review_reason IS NULL OR payment_review_reason IN
  ('amount_mismatch','invalid_commission_config','voucher_claim_failed','psp_fee_unavailable','psp_async_timeout')) NOT VALID;
ALTER TABLE checkout_sessions VALIDATE CONSTRAINT checkout_sessions_payment_review_reason_chk;
```

The CHECK is only widened, so old writers are unaffected. The existing unique indexes on
`psp_payment_request_id` and `psp_payment_id` are global. Stripe ids are prefixed (`cs_`, `pi_`) and
cannot collide with HitPay's, so those indexes stay as they are.

**`platform_config` seed**

```sql
INSERT INTO platform_config (key, value, description) VALUES ('active_psp', '"hitpay"'::jsonb,
 'PSP used for NEW payments: "hitpay" | "stripe". Existing rows keep their own psp_provider. Change via admin /config.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_config (key, value, description) VALUES ('subscriptions_enabled', 'false'::jsonb,
 'Gate for memberships and brand subscriptions on any PSP. Flip via runbook / ops script, never in code.')
ON CONFLICT (key) DO NOTHING;
```

**No change needed** to `processed_webhook_events` (already provider-keyed), `orders`,
`checkout_session_stores`, `order_payouts` (already `psp_provider` + `psp_transfer_id`) or
`ledger_entries`. There are no new tables, so there are no RLS policy or grant changes, and
`rls/policies.sql` is untouched. `grants.test.ts` asserts table-level verbs only, so it is
unaffected.

**Deferred (decide later, not in 0039):** a liability record for late **order** payments. That needs
either a `checkout_session` value in `duplicate_charges_subscription_type_chk` or a sibling table.
§5.4 shrinks the Stripe window enough to leave this out of scope.

### 4.3 Ledger idempotency keys — namespaced without breaking HitPay

- **HitPay keys keep their exact current format forever.** The refund handler recomputes them to
  detect replays (`hitpay.ts:842-913`), and `ledger_entries` is append-only.
- **Order keys are already provider-neutral** (BOMY uuids) and stay unchanged for both providers.
- **New Stripe subscription, duplicate and refund keys get a `stripe:` prefix.** They are built by
  one helper, `ledgerKey(provider, ...parts)`, which returns the legacy unprefixed string for
  `hitpay`.

| Flow                      | HitPay (unchanged)                                                                               | Stripe                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Membership payment        | `membership:recurring:{paymentId}:credit`                                                        | `stripe:membership:invoice:{in_…}:credit`                                                  |
| Brand sub activation      | `brand_sub:{subId}:{paymentId}:credit` / `:debit:payout` / `:debit:fee`                          | `stripe:brand_sub:{subId}:{pi_…}:credit` / `:debit:payout` / `:debit:fee`                  |
| Duplicate inflow / refund | `dup_charge:{paymentId}:credit` / `[:{refundId}]:debit`                                          | `stripe:dup_charge:{pi_…}:credit` / `:debit:fee` / `stripe:dup_charge:{pi_…}:{re_…}:debit` |
| Subscription refund       | `refund:{paymentId}[:{refundId}]:{subId}:debit`                                                  | `stripe:refund:{re_…}:{subId}:debit`                                                       |
| Orders                    | `checkout:{sessionId}:credit`, `order:{orderId}:seller_payout`, `order:{orderId}:processing_fee` | same                                                                                       |

**Membership renewals key on the invoice id**, which is one per billing period. **Refunds key on the
refund id**, so partial refunds each ledger once.

---

## 5. Stripe webhook design

### 5.1 Endpoint and verification

- **Route:** `POST /webhooks/stripe` in `apps/api/src/routes/webhooks/stripe.ts`. It is a separate
  encapsulated Fastify plugin registered next to `hitpayWebhookRoutes` in `server.ts`.
- **Raw body:**
  - The route has its own `addContentTypeParser("application/json", { parseAs: "buffer" })`.
  - Stripe requires the exact raw bytes.
  - The HitPay parser is plugin-scoped and does not leak into this route.
- **Verification:**
  - `stripe.webhooks.constructEvent(rawBuffer, header["stripe-signature"], secret)`. This checks the
    `v1` scheme only, with the default 300 s tolerance.
  - `STRIPE_WEBHOOK_SECRET` may hold a comma-separated list. The route tries each secret, which
    supports Stripe's roll-over window (the old secret stays valid up to 7 days).
  - A bad signature returns 401.
- **Livemode guard:**
  - The route rejects any event where `event.livemode !== expectedLivemode`. Expected livemode is
    derived from the key prefix (`sk_live_`/`rk_live_` → true).
  - A rejected event gets 200, plus an anomaly alert and no processing. That stops test events from
    ever writing to the prod DB.
- **Missing config:**
  - If `STRIPE_WEBHOOK_SECRET` is unset, the route still registers but returns **503**, so Stripe
    retries and api still boots.
  - This deliberately differs from HitPay's throw-at-boot: a missing Stripe secret must not take down
    the HitPay webhook (Invariant 1).
- **Rate limit:** its own `groupId: "stripe-webhook"`, with a higher ceiling than HitPay's 30 because
  Stripe bursts after an outage (proposed 120 per window).
- **Response:**
  - Return 2xx quickly. Checkout waits up to 10 s for the webhook before redirecting the buyer.
  - **Unlike HitPay's "always 200", a thrown DB error returns 500**, so Stripe retries. Stripe retries
    for up to 3 days in live mode, and the handler is idempotent.
  - Handled anomalies still return 200.
- **Destination:**
  - One Stripe "event destination" per mode, set up in Workbench with **Snapshot** payloads (the v1
    `checkout.*`, `invoice.*` and `charge.*` events are snapshot events).
  - The destination is pinned to the same API version as the SDK.
  - Subscribe **only** to the events listed below.

### 5.2 Events handled and mapping

| Stripe event                                                           | Normalized                 | Action                                                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed` (`payment_status = paid`, mode `payment`) | `checkout.paid`            | Order / brand-sub "paid" phase (§6). Mode `subscription` → only link `psp_checkout_id`; money comes via `invoice.paid`.                                         |
| `checkout.session.completed` (`payment_status = unpaid`)               | `checkout.async_pending`   | Async method pending (FPX business banking). Link `psp_payment_id` and set `psp_async_pending_since` but **not** `psp_paid_at`; see §6.1.                       |
| `checkout.session.async_payment_succeeded`                             | `checkout.paid`            | Same as the paid phase.                                                                                                                                         |
| `checkout.session.async_payment_failed`                                | `checkout.failed`          | Order → existing `runFailureRelease` (session `failed`, reservations released, voucher released). Brand sub → `payment_failed`.                                 |
| `checkout.session.expired`                                             | `checkout.expired`         | Order: no-op if already handled by our expiry job; otherwise run the same expiry path. Brand/membership pending row → `expired` (CAS `psp_payment_id IS NULL`). |
| `charge.updated` with `balance_transaction` newly set                  | `fee.available`            | Complete the fee phase (§6).                                                                                                                                    |
| `invoice.paid`                                                         | `recurring.paid`           | Membership activate / renew (§7).                                                                                                                               |
| `invoice.payment_failed`                                               | `recurring.payment_failed` | Log + optional email; entitlement unchanged while Stripe retries (§7).                                                                                          |
| `customer.subscription.deleted`                                        | `recurring.ended`          | Membership cancelled at period end / dunning exhausted (§7).                                                                                                    |
| `charge.refunded`, `refund.updated`, `refund.failed`                   | `refund.updated`           | Re-fetch the Refund; ledger only on `succeeded` (§9).                                                                                                           |
| `charge.dispute.created`, `charge.dispute.closed`                      | `dispute.*`                | Anomaly alert (§9).                                                                                                                                             |
| anything else                                                          | `ignored`                  | 200, info log.                                                                                                                                                  |

### 5.2a Events that can never succeed

Returning 500 on a transient error (DB down) is right: Stripe retries. A **deterministic** failure
(unparseable payload, unknown object, amount mismatch, missing `bomy_ref_id`) would make Stripe
retry for 3 days and could get the endpoint disabled. These are **parked** instead, like the
HitPay "park-on-unparseable" handling: claim the event, log it, park the related row for review
where there is one, and return 200. Only transient errors return 500. This belongs in PR 4.

### 5.3 Idempotency, replay and ordering

- **Gate 1, per event:** `claimEvent(tx, { pspProvider: "stripe", pspEventId: event.id, eventType, payloadHash })`
  in the same `withAdmin` transaction as the handling. This is the existing `processed_webhook_events`
  table. Widen `EventIdentity.pspProvider` to `PspProvider`. If the handler throws, the claim rolls
  back and Stripe's retry processes the event again.
- **Gate 2, per state:** the existing compare-and-swap (CAS) guards (`WHERE status='pending_payment'`,
  `WHERE status='pending'`, `psp_payment_id IS NULL`). Stripe can send two different event ids for
  one change, and this gate still makes each transition happen once.
- **Ordering is not guaranteed, so every handler is order-independent:**
  - `charge.updated` before `checkout.session.completed`: the fee phase finds no `psp_paid_at` and
    no-ops. The paid phase then fetches the fee itself (§6).
  - `invoice.paid` before `checkout.session.completed`: correlate via subscription metadata
    `bomy_ref_id` (§7).
  - Never compare `event.created` to order state transitions.
- **Logging:** log only `event.id`, `type`, object ids and amounts. Never log the payload, which
  holds email, name, address and card last4/brand.

### 5.4 Mapping to the order state machine, including late payments

`checkout_sessions` states are unchanged. Stripe adds only "`pending_payment` **with**
`psp_paid_at IS NOT NULL`", meaning paid at Stripe with the fee not yet known.

| Situation                                                             | Result                                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Paid, amount = `total_buyer_pays_sen`, currency `myr`, fee known      | `fanOutPaid` (unchanged math) → `paid`                                                             |
| Paid, fee pending                                                     | Stamp `psp_payment_id`, `psp_paid_at`; stay `pending_payment`; fan out on `fee.available` or sweep |
| Fee still unknown after 2 h                                           | `payment_review_required`, reason `psp_fee_unavailable`                                            |
| Amount / currency mismatch                                            | `payment_review_required`, `amount_mismatch` (as today)                                            |
| Negative seller payout / bad commission config / voucher claim failed | unchanged park reasons                                                                             |
| Async failed                                                          | `failed` via `runFailureRelease`                                                                   |

Changes this needs, all in PR 4 and all Opus:

- **Expiry job:** `inventory-reservation-expiry` must skip sessions with `psp_paid_at IS NOT NULL`,
  or they would expire while waiting for the fee.
- **Expire Stripe first, then the DB row:**
  - For `stripe` sessions, the job, `cancelPendingCheckout` and `compensate` call
    `provider.expireCheckout(cs_id)` **before** expiring the DB row, outside any transaction.
  - If Stripe answers `already_paid`, the DB session is left alone for the webhook.
  - If Stripe answers with **any other error** (network, 5xx, permission, rate limit), the job skips
    that row, logs it, and retries on the next run. It **never** expires the DB row after a failed
    Stripe call, because that would reopen the late-payment window this design closes.
  - This closes the late-payment window, which HitPay cannot close.
  - Stripe's minimum `expires_at` is 30 min after creation (verify in test mode). So for Stripe
    sessions the DB TTL becomes 35 min and Stripe `expires_at` = DB `expires_at` − 3 min.

---

## 6. Fees — the core Stripe difference

### 6.1 Completed but still unpaid (async payment pending)

FPX business banking can complete the Checkout Session while the payment is still pending (§8).
Rule:

- On `checkout.session.completed` with `payment_status=unpaid`, record `psp_payment_id` (the
  PaymentIntent) and set `psp_async_pending_since = now()`. Do **not** set `psp_paid_at`, and do not
  start the paid phase.
- The expiry job and the cleanup job skip any `stripe` session where `psp_payment_id IS NOT NULL`
  (paid or async-pending). So stock is not released while the payment can still succeed, and a
  Stripe refusal to expire a completed session is treated like `already_paid`.
- `checkout.session.async_payment_succeeded` → paid phase as normal. `async_payment_failed` → the
  existing failure release.
- **Time limit:** after `STRIPE_ASYNC_PAYMENT_MAX_HOURS` (default 48, confirm in the sandbox) a
  sweep parks the session as `payment_review_required` with reason `psp_async_timeout`, so an
  operator resolves it by hand. It never silently expires.
- `psp_async_pending_since timestamptz NULL` is one extra nullable column on `checkout_sessions`,
  added in PR 1's migration.
- **Brand subscriptions (PR 5):** they are also one-off Stripe Checkout and allow FPX, so the same
  state exists there. On `checkout.session.completed` with `payment_status=unpaid`, set the brand
  sub's `psp_payment_id`; the cleanup job already filters on `psp_payment_id IS NULL`, so that alone
  stops it expiring the row. Use the same time limit, then an anomaly alert. Memberships are not
  affected: subscription mode does not allow FPX.
- If Stripe lets us restrict FPX to consumer accounts (B2C confirms immediately), that is an extra
  lever but is **not relied on** here: it is unconfirmed.

**Verified behaviour.** With the current API, capture is **asynchronous by default**
(`capture_method = automatic_async`):

- `balance_transaction` is `null` on the Charge in the API response.
- It is also `null` in the `charge.succeeded` and `payment_intent.succeeded` webhooks.
- Expanding `latest_charge.balance_transaction` "might not be available".
- The fee arrives via `charge.updated` (with `previous_attributes.balance_transaction: null`).
  Stripe's SLA is **1 hour** after confirmation.

Source: <https://docs.stripe.com/payments/payment-intents/asynchronous-capture>. The fee is
`balance_transaction.fee` (with `fee_details[]` and `net`):
<https://docs.stripe.com/api/balance_transactions/object>.

**The rule does not change.** Commission = `(gross − actual PSP fee) × rate`, using the real fee and
never an estimate, because `orders_journal_balance` and `brand_subscriptions_split_chk` lock it in
at activation.

**Design: a two-phase "paid → fee-settled" activation** for orders and brand subscriptions.

1. **Paid phase** (`checkout.paid`):
   - Claim the event, then lock the row (`FOR UPDATE`).
   - Check amount and currency.
   - Stamp `psp_payment_id = pi_…` and `psp_paid_at = now()`. The status stays `pending_payment`
     (orders) or `pending` (brand sub). Stamping `psp_payment_id` already blocks the abandon CAS and
     the reaper, which filter on `psp_payment_id IS NULL`.
   - Then call `getPaymentFee(pi)` **after commit, outside the transaction**. If the fee is `known`,
     run phase 2 straight away. Usually the fee is ready within seconds.
2. **Fee phase** (from `fee.available`, the inline attempt above, or the sweep):
   - Open a new `withAdmin` transaction and lock the row.
   - Require `pending*` and `psp_paid_at IS NOT NULL`.
   - Write `psp_fee_sen`, then run the **unchanged** `fanOutPaid` (orders) or the brand split
     (`brand = floor(net × 90%)`, BOMY the rest).
   - The CAS on status makes double triggers harmless.
3. **Sweep** `psp-fee-settlement`:
   - A BullMQ job every 5 min, MYT cron, deduped across instances like the others.
   - For Stripe rows with `psp_paid_at < now() − 10 min` and still pending, it calls `getPaymentFee`.
   - After 2 h it parks orders as `psp_fee_unavailable` and sends an anomaly alert for brand subs.
     A brand sub stays `pending` but carries `psp_payment_id`, so it is safe from the reaper.

**Validation:**

- `balance_transaction.currency` must be `myr`.
- `fee ≥ 0` and `fee ≤ gross`, as `order-fanout.ts:281` already checks.
- Stripe amounts are integers in minor units. Convert with `assertSafeMinor(n)`
  (`Number.isSafeInteger`, ≥ 0 → `bigint`). `parseSen` is not used for Stripe and is not weakened.

**The fee includes tax.** `fee` is the total deducted, including any tax in `fee_details`, so
"net of PSP fees" means net of the total actually deducted. That matches HitPay's single `fees`
field.

**Option to verify in test mode:**

- Pass `payment_intent_data.capture_method = "automatic"` on Checkout so the balance transaction is
  likely synchronous.
- The docs say async is the _default_. I could not confirm that opting out guarantees a synchronous
  `balance_transaction`.
- The two-phase design is correct either way, so this is only a latency improvement and nothing
  depends on it.

**UX:** the success pages already poll. They show "Payment received — confirming" while
`psp_paid_at` is set and the row is not yet active.

**Membership:** no fee is needed to activate, which matches HitPay's current behaviour
(gross-credit). Decided by the owner: memberships stay gross like HitPay (§13).

**Impact on economics:**

- Stripe Malaysia lists **3% + RM1.00** for domestic cards and FPX, +1% for international cards,
  +2% for currency conversion, 3% for GrabPay, and +0.7% Billing for subscriptions
  (<https://stripe.com/my/pricing>).
- The fixed RM1 dominates small orders (RM10 → ~13%). That makes the existing
  `NegativeSellerPayoutError` park more likely on small multi-store carts.
- Stripe's **minimum charge is RM2.00** (<https://docs.stripe.com/currencies>). Stripe initiation
  must reject a total below 200 sen with a typed `CheckoutErrorCode` (`TOTAL_BELOW_PSP_MINIMUM`).

**Payouts and reconciliation:**

- Stripe settles **MYR only** to BOMY's Malaysian bank. Multi-currency settlement is not offered in
  Malaysia (<https://docs.stripe.com/payouts/multi-currency-settlement>).
- The first payout takes 7 days, and the minimum payout is RM5 (<https://docs.stripe.com/payouts>).
- Seller payouts stay manual from BOMY's bank. The `order_payouts` flow is unchanged.

---

## 7. Recurring membership

**Recommendation: Stripe Billing subscriptions.** The alternative is our own scheduled off-session
charges on a saved payment method, and it loses for these reasons:

- **Recurring rails:** FPX and GrabPay are one-time only, with no `setup_future_usage`, off-session
  or Billing support. Recurring therefore has to use cards, Link or wallets either way
  (<https://docs.stripe.com/payments/fpx>, <https://docs.stripe.com/payments/grabpay>).
- **Off-session 3DS:** off-session renewals of Malaysian cards often need 3DS. Billing handles the
  customer-action email, hosted invoice page and **Smart Retries** (up to 8 retries in 2 weeks by
  default, <https://docs.stripe.com/billing/revenue-recovery/smart-retries>). Building that ourselves
  would mean a second dunning engine.
- **Cost:** 0.7% Billing on RM75 is about RM0.53 a year.

Brand subscriptions are **not** recurring (§2) and use one-off Checkout.

**Flow:**

- **`joinMembership`:**
  - Insert the `pending` row with `psp_provider='stripe'`.
  - Call `createRecurringCheckout` → Checkout `mode=subscription` with:
    - `line_items[0].price_data = { currency: "myr", unit_amount: price, recurring: { interval: "year" }, product_data: { name: "BOMY Membership" } }`
    - `client_reference_id = row.id`
    - `subscription_data.metadata.bomy_ref_id = row.id`
    - `customer_email`
  - Store `psp_checkout_id = cs_…`.
  - Using `price_data` means there is no Price catalogue to manage. A change to
    `platform_membership_price_myr_sen` applies to new joins only, which matches today.
- **`invoice.paid` (correlation):**
  - Read the subscription id and `bomy_ref_id` from the invoice. They sit under
    `parent.subscription_details` in recent API versions. **Verify against the pinned version.**
  - Then call the extracted core `activateOrRenewMembership(tx, "stripe", …)`, which is the same
    logic as `hitpay.ts:252-476`.
- **`invoice.paid`, billing reason `subscription_create`:**
  - Activate the pending row.
  - Stamp `psp_recurring_id`, `psp_customer_id` and `psp_payment_id`. `psp_payment_id` is the
    invoice's PaymentIntent, which is the refundable handle.
  - Ledger `stripe:membership:invoice:{in}:credit`.
  - The existing "user already active → duplicate" branch applies. On Stripe it **also calls
    `cancelRecurring(sub_…, { atPeriodEnd: false })` immediately**, so the duplicate does not renew
    next year.
  - The HitPay duplicate branch does not cancel the second recurring billing today. That is an
    existing gap, flagged in §14.
- **`invoice.paid`, `subscription_cycle` (renewal):**
  - Use the existing renewal branch: expire the newest row and insert a new active row.
  - Use Stripe's line period for `period_start`/`period_end`, not `+1 year`, so our dates match
    Billing.
  - If the daily lapse job already expired the row because the retries outlasted `period_end`, the
    renewal branch still works. It already handles a non-active previous row.
- **`invoice.payment_failed`:**
  - Log, and optionally send our own "update your card" email.
  - **Do not** set `payment_failed` on the current row (HitPay does this today). Stripe is still
    retrying, and the paid period is unaffected.
  - Configure Smart Retries' final action as **cancel subscription**.
- **`customer.subscription.deleted`:**
  - Set `cancelled_at` if it is null.
  - Set status `cancelled` only once `now ≥ period_end`, which is the same rule as `hitpay.ts:492-524`.
  - The existing `expireCancelledMemberships` sweep finishes the rest.
- **Cancel (web and admin `cancelMembership`):**
  - `getProvider(sub.pspProvider).cancelRecurring(sub.pspRecurringId, { atPeriodEnd: true })`, then
    record `cancelled_at`. Behaviour is unchanged: the membership stays active until `period_end`.
  - For Stripe this is `subscriptions.update(id, { cancel_at_period_end: true })`.
- **Emails:**
  - `membership-renewal-notification` reads only `period_end` and `notified_days`, so it is
    provider-neutral and stays as it is.
  - Owner decision: **Stripe sends no customer emails.** Turn off every customer email in the Stripe
    Dashboard (receipts, upcoming renewal, failed payment). The platform sends the renewal reminder,
    the payment confirmation and the failed-renewal notice itself (§13 follow-up).
  - `invoice.upcoming` exists but we don't need it.
- **Coexistence:**
  - HitPay members keep `psp_provider='hitpay'` and renew through `/webhooks/hitpay`, unchanged.
  - The partial unique index "one active membership per user" spans both providers, so it is the
    database-level guard against someone holding both.
  - The expiry and reminder jobs are provider-neutral.
  - A HitPay member who cancels and later re-joins after the switch re-joins on Stripe.

---

## 8. Payment methods and account facts (verified 2026-11-24 against Stripe docs)

| Topic                           | Finding                                                                                                                                                                                    | Source                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Country                         | Malaysia supported; businesses incl. sole proprietors                                                                                                                                      | <https://stripe.com/global>, <https://stripe.com/legal/ssa/my>            |
| Cards                           | Visa, Mastercard, UnionPay, debit. **Amex not listed for MY**                                                                                                                              | <https://docs.stripe.com/currencies>                                      |
| FPX                             | MY customers, **MYR only**, one-time; Checkout `mode=payment` yes, subscription/setup **no**; B2C RM1–30k; B2C confirms immediately, B2B pending; **needs a Business Registration Number** | <https://docs.stripe.com/payments/fpx>                                    |
| GrabPay                         | MY/SG businesses, MYR, one-time, no recurring; confirms immediately                                                                                                                        | <https://docs.stripe.com/payments/grabpay>                                |
| Link / Apple Pay / Google Pay   | Checkout + subscriptions supported (MY listed for Link)                                                                                                                                    | <https://docs.stripe.com/payments/payment-methods/payment-method-support> |
| Alipay / WeChat Pay             | Conflicting / not listed for MY businesses                                                                                                                                                 | same page; <https://stripe.com/my/pricing>                                |
| **DuitNow, Touch 'n Go, Boost** | **Not confirmed** — no docs page found                                                                                                                                                     | —                                                                         |
| Settlement                      | MYR only; foreign-currency charges converted (+2%)                                                                                                                                         | <https://docs.stripe.com/payments/currencies/settlement-payouts>          |
| Webhook retries                 | Live: up to 3 days, exponential; sandbox: 3 tries over hours; no ordering guarantee; dedupe on event id                                                                                    | <https://docs.stripe.com/webhooks>                                        |
| Test cards                      | `4242…` success; `4000002500003155` 3DS; `4000000000000002` decline; `4000000000009995` insufficient funds                                                                                 | <https://docs.stripe.com/testing>                                         |
| FPX/GrabPay test                | Stripe test page "authorize / fail"; **no documented test bank list**                                                                                                                      | <https://docs.stripe.com/payments/fpx/accept-a-payment>                   |
| Sandboxes                       | Recommended over legacy test mode; `stripe sandbox create` makes an anonymous sandbox **without account registration** → we can build before the MY account exists                         | <https://docs.stripe.com/sandboxes>                                       |
| API idempotency                 | `Idempotency-Key` on POST, ≤255 chars, first response (incl. 500) replayed, keys pruned after ≥24 h                                                                                        | <https://docs.stripe.com/api/idempotent_requests>                         |

**Enabled methods (proposal):**

- **One-off** (orders, brand subs): cards, FPX, GrabPay, Apple Pay and Google Pay, enabled through
  Dashboard payment-method settings. Code does not hard-code `payment_method_types`.
- **Membership:** whatever Checkout allows in subscription mode, which in practice means cards, Link
  and wallets.

**Account restriction — read Risk #1.** Stripe's Malaysian Services Agreement forbids acting as a
"pass-through agent" or a "payment facilitator, intermediary or aggregator". Its restricted-business
list includes "receiving settlement proceeds for goods or services that you did not provide"
(<https://stripe.com/en-my/restricted-businesses>). Stripe's marketplace answer is **Connect**
(<https://docs.stripe.com/connect/marketplace>). BOMY collects for third-party sellers and pays them
manually, which fits that description.

---

## 9. Refunds, disputes, duplicates and reconciliation per provider

- **Duplicate charges (admin `refundDuplicateCharge`):**
  - The action becomes provider-aware: `getProvider(row.pspProvider).refund({ pspPaymentId, amountSen, reason, idempotencyKey: "dup_refund:" + row.id })`.
  - The existing CAS (`detected → refund_pending`) stays.
  - With Stripe's idempotency key, a "REFUND_OUTCOME_UNKNOWN" retry within 24 h is **safe** to
    resend. HitPay has no equivalent.
  - A definite rejection (`StripeInvalidRequestError` / `StripeCardError`) reverts the row to
    `detected`. Network and 5xx errors leave it `refund_pending`.
- **Refund webhooks (Stripe):**
  - On `charge.refunded`, `refund.updated` or `refund.failed`, **re-fetch the Refund**.
  - Act only on `status = succeeded`. FPX refunds are asynchronous, take up to about 6 weeks and
    cannot be cancelled. The refund window is 60 or 180 days, because Stripe's pages disagree, so
    assume 60.
  - Match `duplicate_charges` by `(psp_provider, psp_payment_id)` first, as `hitpay.ts:822` does.
    Then match member/brand rows by `psp_payment_id`.
  - The ledger keys are in §4.3.
  - On `failed`, set the duplicate back to `detected` and send an anomaly alert.
- **Fees are not returned on refund.** Stripe does not return the original processing fee
  (<https://stripe.com/my/pricing>). So for a Stripe duplicate:
  - Record `psp_fee_sen` on the duplicate row once it is known.
  - Book a `stripe:dup_charge:{pi}:debit:fee` leg to `expense:processing_fee`. BOMY absorbs the fee,
    and the ledger then matches the Stripe balance.
  - Whether HitPay returns fees on refund is unknown, and the HitPay path is unchanged.
- **Refunds with no match** (for example an order refunded by hand from the Stripe Dashboard):
  - Send an anomaly alert (`webhook_refund_unmatched`), the same pattern as GAPS #11.
  - Order refunds stay out of scope. **Ops rule:** do not refund orders from the Dashboard until an
    order refund flow exists.
- **Disputes / chargebacks** (cards only; FPX and GrabPay have none):
  - `charge.dispute.created` sends an anomaly alert email with the PaymentIntent, amount and reason,
    and the row it maps to. `closed` sends a second alert with the outcome.
  - There is no automatic ledger posting in this project. The dispute fee is RM90, plus RM90 for a
    manual response (refunded if won).
  - A `disputes` table plus ledger legs is a follow-up.
- **Reconciliation:**
  - `/payouts/reconciliation` and the membership and brand-sub admin tables gain a **Provider**
    column, and switch to `psp_payment_id` / `psp_recurring_id`.
  - `ledger_entries` gets no provider column. The provider comes from the referenced row's
    `psp_provider`, and Stripe keys carry the `stripe:` prefix.
  - Monthly manual check: the sum of `expense:processing_fee` legs for Stripe-referenced rows should
    equal Stripe's balance report fees for the period (minus dispute and Billing fees, booked by
    hand).

---

## 10. Security and operations

**Environment variables.** All must be added to `turbo.json` `env`, otherwise Turborepo strips
them (see CLAUDE.md gotcha).

| Variable                | api (Railway)                                                                                                                                                                                                            | web (Vercel)                                        | admin (Vercel)                            | Notes                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | yes (restricted `rk_`: read PaymentIntents, Charges, Balance txns, Invoices, Subscriptions, Refunds; write Subscriptions for duplicate cancel; **write Checkout Sessions, needed by the expiry job's `expireCheckout`**) | yes (`rk_`: write Checkout Sessions, Subscriptions) | yes (`rk_`: write Refunds, Subscriptions) | **One restricted key per service**, least privilege. Exact permission names to be confirmed when creating them. |
| `STRIPE_WEBHOOK_SECRET` | yes (`whsec_…`, comma-list allowed during rotation)                                                                                                                                                                      | —                                                   | —                                         |                                                                                                                 |
| `HITPAY_*`              | unchanged                                                                                                                                                                                                                | unchanged                                           | unchanged                                 | Keep while any HitPay row can move money.                                                                       |

There is no publishable key: hosted Checkout is a redirect, with no Stripe.js or Elements.

- **Test-key guard:**
  - `StripeProvider.isConfigured()` returns **false** when `VERCEL_ENV === "production"` (web and
    admin), or when the api runs in production, with a `*_test_` key, unless
    `STRIPE_ALLOW_TEST_KEYS=true` is set deliberately.
  - **Stripe keys must never be set in the Vercel Preview environment.** Previews share the
    production api and database (§13), so a preview with test keys would write pending test
    checkouts into the production DB, and the production api would then reject their test webhooks
    (livemode guard), leaving the rows stuck.
  - Do not rely on `VERCEL_ENV` alone. A `*_test_` key is accepted **only when the database is
    local** (host `localhost`, `127.0.0.1` or `::1`), or when `STRIPE_ALLOW_TEST_KEYS=true` is set
    deliberately. A live key is refused when the database is local. This ties the guard to which
    database the app is pointed at.
  - Without this, setting `active_psp=stripe` with test keys on prod would expose membership and
    brand-sub test-mode checkout to real users. Those flows are **not** gated by `checkout_enabled`.
  - The webhook `livemode` guard (§5.1) is the inbound twin of this check.
- **Key rotation:**
  - Create the new restricted key, paste it into Vercel and Railway, redeploy, then delete the old
    key in Stripe.
  - Webhook secret: "roll" in Stripe (the old secret stays valid up to 7 days), set
    `STRIPE_WEBHOOK_SECRET=new,old`, deploy, then remove `old`.
- **What the owner pastes where:**
  - Keys go **directly** into the Vercel project env (web, admin) and Railway service variables
    (api), and into local `apps/*/.env.local` for development.
  - **Never into chat, PRs, logs or `.env.example`.** `.env.example` gets empty placeholders with
    comments only.
- **PCI:** hosted Checkout keeps card data off BOMY entirely (SAQ-A scope). We store only Stripe ids.
- **PDPA:** Stripe processes personal data outside Malaysia.
  - Before go-live, update the privacy notice and processor list to name Stripe, and cover
    cross-border transfer.
  - **Legal owner action**, not code.
  - Webhook logs must not include payloads (§5.3).
- **Observability:**
  - OTel span attributes `bomy.psp_provider` and `bomy.psp_event_id` on both routes.
  - The anomaly alert types listed above.
  - `/ready` reports which PSPs are configured and the Stripe livemode.

---

## 11. Testing, rollout and rollback

**No real HTTP in tests:**

- `StripeProvider` takes an injected `StripeLike`, the subset of SDK calls we use. Unit tests pass a
  fake.
- `HitPayProvider` tests mock `fetch` the same way `packages/hitpay/tests` already does.
- api route tests build the app with a fake provider registry.
- Webhook signature tests sign fixture payloads with `stripe.webhooks.generateTestHeaderString`,
  which needs no network.
- Fixtures are recorded from a sandbox with `stripe trigger` and stripped of personal data.

| PR  | Tests                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Migration integration test (`pnpm test:integration`, real Postgres, `bomy_app`): backfill copies; new CHECK accepts old-style (`hitpay_fee_sen`) and new-style (`psp_fee_sen`) active rows and rejects unbalanced; dup-charge insert with only `psp_payment_id`; unique `(provider, id)` indexes; `active_psp` seeded; `grants.test.ts`, `rls.test.ts` green. |
| 2   | **All existing HitPay suites unchanged and green** (`hitpay.test.ts`, `hitpay-order.test.ts`, `order-fanout`, duplicate_charges, memberships); new assertions that HitPay writes both column sets; adapter unit tests.                                                                                                                                        |
| 3   | Config action: role gate, audit row old→new, rejects unknown value, never writes `checkout_enabled`, role lock vs a racing demotion; ops CLI `active_psp` role/value rules; `paymentsEnabled()` truth table (subscriptions_enabled × active × configured; test-key-in-prod moves to PR 4 with the real adapter).                                              |
| 4   | Stripe webhook: bad sig 401, livemode mismatch, replayed `evt` no-op, out-of-order (`charge.updated` first), fee pending → sweep → fan-out, fee > gross park, 2 h → `psp_fee_unavailable`, amount mismatch park, async failed → release, expiry job skips paid-awaiting-fee and respects `already_paid`, RM2 minimum.                                         |
| 5   | Brand sub: two-phase activation, split balances, CAS vs re-subscribe, duplicate path with `stripe:` keys.                                                                                                                                                                                                                                                     |
| 6   | Membership: create → `invoice.paid` before/after `checkout.session.completed`, renewal row + period from Stripe, duplicate → auto-cancel, `payment_failed` leaves entitlement, `subscription.deleted` semantics, coexistence (HitPay row renews via HitPay route in the same DB).                                                                             |
| 7   | Refund idempotency key, unknown-outcome retry, FPX pending→succeeded, refund.failed revert, fee-not-returned leg, dispute alert.                                                                                                                                                                                                                              |

**Test-mode smoke checklist** (local stack plus `stripe listen --forward-to localhost:3001/webhooks/stripe`,
run with `active_psp=stripe` in the local DB):

1. Order paid with card `4242…`. The session reaches `paid` after the fee arrives. Check the orders'
   journal balance, the ledger legs and the stock conversion.
2. Order with the 3DS card `4000002500003155`. Also a decline (`…0002`): the session stays
   `pending_payment`, then expires and releases.
3. FPX success and failure on Stripe's test page, then GrabPay.
4. Abandon, then let it expire. The Stripe session is expired first, and a late pay attempt is
   refused by Stripe.
5. Brand sub: pay, check the split, then re-subscribe after abandoning.
6. Membership: join, then `stripe test_helpers test_clocks` to advance a year. Check the renewal row
   and the reminder emails in Mailhog. Then a failed renewal (`4000000000000341` attached-then-fail),
   then cancel at period end.
7. Duplicate membership: the second sub is auto-cancelled, and a duplicate row is created. Refund it
   from admin, then confirm the ledger and status.
8. Replay any event from the Dashboard or CLI. Nothing changes.
9. Evidence goes under `docs/runbooks/evidence/`.

**Rollout:**

1. PRs 1–7 merge **dark**. `active_psp` stays `hitpay`, prod has no Stripe keys, and
   `checkout_enabled=false`.
2. After live account approval, the owner sets live restricted keys and the webhook secret in
   Railway, Vercel web and Vercel admin, and creates the live event destination.
3. Set `active_psp=stripe` in admin. Run the **live smoke**: a real small brand-sub or membership
   payment, then a refund via the duplicate path or the Dashboard with the alert expected.
4. Only then follow `docs/runbooks/checkout-enabled-flip.md`, updated in PR 7 to say "live smoke on
   the active PSP", to flip `checkout_enabled`. That is an operational act, never code.

**Rollback:**

- **Switch back to HitPay (planned):** set `active_psp=hitpay` in admin `/config` when HitPay is
  configured on admin. It takes effect on the next request. Stripe rows already created keep working
  through `/webhooks/stripe`. **Do not remove Stripe keys** while Stripe memberships, pending
  sessions or refundable duplicates exist.
- **Code rollback:** every migration is additive and HitPay dual-writes, so reverting any of PRs 2–7
  leaves HitPay working. Reverting PR 1 is never needed, because nothing reads the new columns until
  PR 2.
- **Kill switch (stop ALL new payments):** switching provider is **not** a stop. Admin, web and api
  are separate deployments with separate keys, so admin can lack HitPay keys while the storefront
  still has them, and `active_psp=hitpay` would then route new payments to HitPay. The stop is:
  (1) `checkout_enabled=false`, (2) `subscriptions_enabled=false`, both via
  `ops:platform-config:set` (audited: `platform_config_audit` + `admin_bypass_audit`), (3) verify,
  then optionally (4) `active_psp=hitpay` via admin, or via the CLI when HitPay is dormant on admin
  (`bomy_admin` / `bomy_finance` only, no credential check). Both flags fail closed on every
  deployment. Exact commands, verification and restore: `docs/runbooks/active-psp-switch.md` §2.

---

## 12. Staged PR plan

| PR    | Scope                                                                                                                                                                                                                                                                                                                                     | Main files                                                                                                                                                                                                                                                                                                                                            | Migration                                            | Risk                                           | Model                                               | Owner must, before                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Additive provider columns (incl. `checkout_sessions.psp_async_pending_since`), backfill, CHECK rewrites, review reasons (`psp_fee_unavailable`, `psp_async_timeout`), `active_psp` + `subscriptions_enabled` seed; Drizzle schema mirrors                                                                                                 | `packages/db/drizzle/0039_psp_provider_columns.sql`, `schema/{member_subscriptions,brand_subscriptions,duplicate_charges,checkout_sessions}.ts`, `packages/db/tests/*`                                                                                                                                                                                | **0039**                                             | Med (prod schema)                              | **Opus**                                            | Approve; apply 0039 to Neon after merge (as for 0037/0038)                                                                                    |
| **2** | `packages/psp` + `PaymentProvider` + HitPay adapter; web/admin outbound calls via registry; HitPay dual-write; shared readers → `psp_*`; `ledgerKey` helper; re-backfill                                                                                                                                                                  | `packages/psp/**`, `apps/web/src/app/{checkout,(marketing)/membership,brands/[slug]/subscribe}/actions.ts`, `apps/admin/src/app/{memberships,payouts/reconciliation}/actions.ts`, admin/web pages listed in §2, `apps/api/src/routes/webhooks/hitpay.ts` (writes only), `jobs/expire-abandoned-pending-memberships.ts`, `next.config.ts` ×2           | **0040** (re-backfill only)                          | Med — "no behaviour change" on live money code | **Opus**                                            | —                                                                                                                                             |
| **3** | `active_psp` read (`getActivePsp`), `subscriptions_enabled` gate **enforced** (default false: new memberships and brand subs close on deploy, §13), async `paymentsEnabled()` replacing env sniff, provider pinned on row creation, admin `/config` switch with audit, `/ready` PSP status; Stripe provider stub (`isConfigured()=false`) | `apps/web/src/lib/{active-psp,payments-enabled}.ts`, membership + brand-subscribe pages/actions, `checkout/actions.ts`, `apps/admin/src/app/config/{page.tsx,actions.ts}`, `apps/api/src/routes/ready.ts`                                                                                                                                             | no (optional RLS public-flag policy → would be 0041) | Low–Med                                        | **Opus** gate logic; **Sonnet** config UI           | None: switch roles decided (`bomy_admin` + `bomy_finance`, §13)                                                                               |
| **4** | Stripe order checkout: `StripeProvider` (one-off, expire, fee), `/webhooks/stripe` (verify, livemode, claim, routing), two-phase fee + `psp-fee-settlement` job, expiry-job / compensate changes, RM2 minimum, env + turbo, extract order core to accept bigint inputs                                                                    | `packages/psp/src/stripe/**`, `apps/api/src/routes/webhooks/stripe.ts`, `apps/api/src/webhooks/{core,hitpay}/order-fanout.ts`, `idempotency.ts`, `jobs/{psp-fee-settlement,inventory-reservation-expiry}.ts`, `scheduler.ts`, `server.ts`, `plugins/rate-limit.ts`, `apps/web/src/app/checkout/{actions,compensate}.ts`, `turbo.json`, `.env.example` | no                                                   | **High** (order fan-out + expiry job)          | **Opus**                                            | Create a Stripe **sandbox** (`stripe sandbox create`, no account needed); install Stripe CLI; paste sandbox keys into local `.env.local` only |
| **5** | Brand subscriptions on Stripe (one-off) incl. duplicate path                                                                                                                                                                                                                                                                              | `brands/[slug]/subscribe/actions.ts`, `webhooks/core/brand-subscription.ts`, Stripe route branch                                                                                                                                                                                                                                                      | no                                                   | Med–High                                       | **Opus**                                            | —                                                                                                                                             |
| **6** | Membership on Stripe Billing: join, `invoice.*`, `customer.subscription.deleted`, cancel (web+admin), duplicate auto-cancel, period from Stripe                                                                                                                                                                                           | `(marketing)/membership/actions.ts`, `apps/admin/src/app/memberships/actions.ts`, `webhooks/core/membership.ts`, Stripe route                                                                                                                                                                                                                         | no                                                   | High (recurring money)                         | **Opus**                                            | Sandbox Billing settings: Smart Retries end = cancel; Turn off every Stripe customer email (decided, §13)                                     |
| **7** | Provider-aware duplicate refund + Stripe refund/dispute webhooks + fee-not-returned leg; Provider columns on admin tables; runbook updates (checkout flip "active PSP", Stripe go-live + rotation)                                                                                                                                        | `payouts/reconciliation/{actions,page}.tsx`, `payout-error-copy.ts`, `webhooks/core/refund.ts`, `notifications/webhook-anomaly.ts`, admin memberships/brand-subs pages, `docs/runbooks/*`                                                                                                                                                             | no                                                   | Med                                            | **Opus** refund code; **Sonnet** admin UI + runbook | Live account approved; live restricted keys + live webhook destination pasted into Railway/Vercel; PDPA notice updated; then live smoke       |

PR 4 may split into **4a** (Stripe package, webhook skeleton with verify, livemode check and claim,
all events `ignored`) and **4b** (order flow) if the diff passes about 1,200 lines. That keeps the
riskiest review focused. Each PR gets its `log/` entry before the next starts, per the repo
convention.

---

## 13. Owner decisions and remaining questions

### Decided by the owner (2026-11-24)

| #   | Topic                               | Decision                                                                                                     | Effect on this design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | Gate for memberships and brand subs | **Add a separate `subscriptions_enabled` flag, default `false`**, flipped by runbook like `checkout_enabled` | PR 1 seeds the flag; **PR 3 enforces it** (owner decision 2026-11-26, PR 3 review; this replaces the earlier "PR 5 and PR 6 check it"). PR 5 and PR 6 reuse the same check for Stripe. It is never flipped in code. **Effect on deploy of PR 3:** new HitPay memberships and brand subscriptions close (before: prod `/membership` showed "Sign in to join"; after: "Memberships will reopen soon", the brand plans page shows "Subscriptions will reopen soon", and the account Renew link hides; the storefront "Subscription plans" link stays until 0041). Existing management, cancellation and renewal paths stay available. No real HitPay payments exist, so nothing changes in practice, and the runbook says so. |
| 4   | HitPay in production                | **No real HitPay recurring members exist.**                                                                  | Coexistence code stays (cheap, and the seam is needed anyway) but the HitPay renewal path carries less live risk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | Membership fee booking              | **Follow HitPay: book the gross amount, record no PSP fee.**                                                 | §6 stays as written. Stripe memberships credit gross to `revenue:platform_subscription`. The reconciliation page will differ from Stripe payout reports by the fee for memberships; accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | Who can switch `active_psp`         | **`bomy_admin` and `bomy_finance`.** No two-person approval was requested, so none is built.                 | The switch action allows both roles and writes a config audit row either way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | Payment methods                     | **Cards, FPX, GrabPay, Apple Pay and Google Pay** for one-off payments.                                      | DuitNow / Touch 'n Go stay "unconfirmed" (§8) and are not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | Emails                              | **Stripe sends no customer emails. The platform sends them all.**                                            | In the Stripe Dashboard, turn off every customer email (receipts, upcoming renewal, failed payment). Our own jobs and handlers send everything. See the follow-up below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Follow-up from decision 9:** because Stripe will not email receipts, the platform must send its own
payment confirmation for orders, brand subscriptions and membership (first payment and each renewal), and
a failed-renewal notice for membership. PR 4 must check which of these already exist for HitPay and reuse
them; any missing one is added in the PR that introduces that payment path. Mail goes through the existing
`@bomy/mailer` with the `after()` / fire-and-forget rules in `app/CLAUDE.md`.

### Still open

1. **Stripe Connect.** Stripe's terms (§8) suggest that a marketplace collecting for sellers needs
   Connect. When you apply, ask Stripe directly whether BOMY can run on a standard account
   with manual seller payouts. If Stripe requires Connect (destination charges), PR 4+ changes shape:
   payouts become Stripe transfers and sellers need onboarding. Would you accept that?
2. **Legal entity.** Sdn Bhd or sole proprietorship? FPX requires a Business Registration Number.
3. **Staging.** Until a separate staging stack exists, testing is **local sandbox only**: Stripe keys
   never go into Vercel Preview or production until the live go-live (§10). Do you want a deployed
   staging stack later?

---

## 14. Risks (ranked)

1. **Stripe may refuse or close the account over marketplace fund flow** without Connect (§8). Mitigation: Q1 before
   building PR 4+ deeply; the provider seam (PRs 1–3) is useful either way. _Possibly the same
   reason HitPay approval stalled — worth asking HitPay too._
2. **Async fee capture changes the order activation path.** Two-phase fan-out, expiry-job exclusion and a sweep
   touch the most sensitive code. Mitigation: unchanged split math, CAS guards, Opus, exhaustive
   out-of-order tests.
3. **Test-mode leakage into prod.** Test keys plus ungated memberships could take fake payments on the
   real site. Mitigation: test-key guard, livemode guard, `subscriptions_enabled` flag, `active_psp` default `hitpay`.
4. **Late or duplicate payments.** Abandoned Stripe checkouts are expired before the DB row; duplicate
   memberships are auto-cancelled. The order late-payment liability gap remains (existing, HitPay too).
5. **Deploys across 3 services plus manual Neon migration.** Mitigation: additive-only, dual-write, 0040
   re-backfill, rollback-safe ordering.
6. **Stripe API version drift.** Invoice and subscription fields moved in 2025 versions. Mitigation: pin
   `apiVersion` in SDK _and_ event destination; fixtures recorded at that version.
7. **Economics.** The fixed RM1 fee plus RM2 minimum hurts small orders, and parks on negative seller payout get
   more likely. Owner awareness; maybe a minimum order value.
8. **Column dual-write drift** (`hitpay_*` vs `psp_*`) until the contract PR. Mitigation: tests assert both
   sets; contract PR scheduled once HitPay's fate is decided.
9. **PDPA cross-border processing.** A privacy-notice update is needed before live (owner/legal).
10. **Audit-table volume** from `withAdmin` reads of `active_psp` on every payments page view. Optional
    public-read policy (PR 3).

**Existing HitPay gaps noticed (not fixed here):**

- The HitPay duplicate-membership branch does not cancel the second recurring billing.
- HitPay `failed` sets `payment_failed` on an active row immediately.
- `updateRenewalNotificationDays` writes no `platform_config_audit` row.
- `app/CLAUDE.md` still lists admin on Railway.

**Could not confirm (needs a sandbox check or Stripe support):**

- DuitNow, Touch 'n Go or Boost availability.
- Amex for Malaysian accounts.
- Whether `capture_method=automatic` on Checkout makes the balance transaction synchronous.
- The Checkout `expires_at` minimum (assumed 30 min).
- The FPX refund window (60 vs 180 days).
- Whether a `refund.created` event exists (the design does not rely on it).
- Default Stripe customer emails for MY Billing.
- The exact restricted-key permission names.
- Whether HitPay returns fees on refunds.
