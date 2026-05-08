# Stage 4 — Membership & Subscriptions Design

**Date:** 2026-04-30 (rev. 2026-05-01: commission is net-of-fees)
**Author:** Andy (AI technical lead)
**Status:** Approved by Charlie
**Builds on:** Proposal v2, project_membership_model.md memory

---

## 1. Scope

All 8 subsystems are in scope for Stage 4:

1. DB schema + RLS
2. #1 Platform Membership (RM75/yr, HitPay recurring billing)
3. #2 Brand Subscription (3/6/12 mo terms, HitPay one-time payment)
4. Voucher issuance engine (monthly, 3 amount types)
5. Goodie Box admin module (quarterly dispatch, manual tracking entry)
6. Member discount at checkout (5–10% for active #2 subscribers)
7. Auto-renewal notifications (#1 only: T-30/T-14/T-7/T-1)
8. Real payment processing via HitPay

**Out of scope for Stage 4:** Stripe (deferred), automated brand payouts (admin-triggered manual for now), KYC/compliance gates, wallet top-up.

---

## 2. Locked Decisions

| Decision                  | Value                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PSP                       | HitPay only. All transactions in MYR. USD is display-only (FX estimate).                                                                      |
| Commission basis          | Net-of-fees. `net = gross − hitpay_fee`. Regular orders: BOMY = `net × 25 %`. Brand subscriptions: BOMY = `net × 10 %`. (Updated 2026-05-01.) |
| Platform membership price | RM75/yr (7500 sen). Stored in `platform_config.platform_membership_price_myr_sen`.                                                            |
| Brand subscription split  | Fee taken off the top, then 90 % brand / 10 % BOMY. `brand_payout + bomy_commission + hitpay_fee = price`. Snapshotted at purchase.           |
| Architecture              | Option A — Server-Actions-First. `packages/hitpay` client, server actions in `packages/db`, single webhook endpoint in `apps/api`.            |
| Recurring billing         | HitPay native recurring billing (`/v1/recurring-billing`, `cycle=yearly`) for #1. One-time payment requests for #2.                           |
| Brand payouts             | Manual for Stage 4. Admin triggers HitPay Transfers API to pay brand's bank account. Records `brand_payout_at`.                               |
| Voucher expiry            | End of issuance month. No rollover.                                                                                                           |
| No stacking               | Platform #1 voucher and #2 brand discount are mutually exclusive at checkout. Buyer picks one.                                                |
| Future PSP                | HitPay for MYR stays. Stripe and HitPay (second gateway) to be added later for international expansion.                                       |

---

## 3. Database Schema

### 3.1 New Enums

```sql
subscription_status: pending | active | expired | cancelled | payment_failed
voucher_type: fixed_myr | percentage | random_myr
dispatch_status: pending | dispatched | delivered
-- Extend existing revenue_source enum:
revenue_source: + platform_subscription | brand_subscription | processing_fee
```

### 3.2 New Tables

#### member_subscriptions

Tracks each #1 Platform Membership instance per user.

| Column                  | Type                  | Notes                                         |
| ----------------------- | --------------------- | --------------------------------------------- |
| id                      | uuid PK               |                                               |
| user_id                 | uuid → users          |                                               |
| status                  | subscription_status   |                                               |
| price_myr_sen           | bigint                | Snapshot at purchase                          |
| period_start            | timestamptz           |                                               |
| period_end              | timestamptz           |                                               |
| hitpay_recurring_id     | text nullable         | HitPay recurring billing ref                  |
| hitpay_payment_id       | text nullable         | Last successful charge ref                    |
| welcome_gift_dispatched | boolean default false | First year only                               |
| notified_days           | jsonb default '[]'    | Array of days already notified (e.g. [30,14]) |
| cancelled_at            | timestamptz nullable  |                                               |
| created_at              | timestamptz           |                                               |
| updated_at              | timestamptz           |                                               |

**Constraints:** Unique partial index on `(user_id)` where `status = 'active'` — one active membership per user.
**RLS:** User sees own rows. `bomy_ops`/`bomy_admin` see all.

#### brand_subscription_plans

Brand-configured subscription tiers, approved by admin before going live.

| Column        | Type                  | Notes                             |
| ------------- | --------------------- | --------------------------------- |
| id            | uuid PK               |                                   |
| store_id      | uuid → stores         |                                   |
| term_months   | integer               | 3, 6, or 12                       |
| price_myr_sen | bigint                |                                   |
| discount_pct  | smallint              | 5–10 (integer percent)            |
| description   | text nullable         | Brand-written benefit description |
| is_active     | boolean default false | Admin approves before live        |
| created_at    | timestamptz           |                                   |
| updated_at    | timestamptz           |                                   |

**RLS:** Public read (buyers need to see plan prices). `seller_owner` can insert/update own store's plans. `bomy_ops`/`bomy_admin` can set `is_active`.

#### brand_subscriptions

Per-buyer brand subscription instance.

| Column              | Type                            | Notes                                   |
| ------------------- | ------------------------------- | --------------------------------------- |
| id                  | uuid PK                         |                                         |
| user_id             | uuid → users                    |                                         |
| store_id            | uuid → stores                   |                                         |
| plan_id             | uuid → brand_subscription_plans |                                         |
| status              | subscription_status             |                                         |
| price_myr_sen       | bigint                          | Snapshot at purchase                    |
| discount_pct        | smallint                        | Snapshot at purchase                    |
| period_start        | timestamptz                     |                                         |
| period_end          | timestamptz                     | Computed: period_start + term_months    |
| hitpay_payment_id   | text nullable                   |                                         |
| hitpay_fee_sen      | bigint nullable                 | Set by webhook on activation            |
| bomy_commission_sen | bigint                          | (price − fee) × 10 %, set on activation |
| brand_payout_sen    | bigint                          | (price − fee) × 90 %, set on activation |
| brand_payout_at     | timestamptz nullable            | Set when admin triggers payout          |
| cancelled_at        | timestamptz nullable            |                                         |
| created_at          | timestamptz                     |                                         |
| updated_at          | timestamptz                     |                                         |

**RLS:** User sees own. `seller_owner` sees subscriptions to their store (no buyer PII beyond user_id). `bomy_ops`/`bomy_admin`/`bomy_finance` see all.

#### vouchers

Monthly vouchers issued to active #1 members.

| Column              | Type                 | Notes                                            |
| ------------------- | -------------------- | ------------------------------------------------ |
| id                  | uuid PK              |                                                  |
| user_id             | uuid → users         |                                                  |
| code                | text UNIQUE          | Alphanumeric, 8–12 chars                         |
| type                | voucher_type         |                                                  |
| fixed_amount_sen    | bigint nullable      | Used when type = fixed_myr                       |
| percentage          | smallint nullable    | Used when type = percentage (e.g. 10 = 10%)      |
| random_resolved_sen | bigint nullable      | Resolved amount for random_myr (set at issuance) |
| issued_month        | text                 | "YYYY-MM" e.g. "2026-05"                         |
| expires_at          | timestamptz          | End of issuance month                            |
| redeemed_at         | timestamptz nullable |                                                  |
| redeemed_order_id   | uuid nullable        | FK to orders (Stage 5+)                          |
| created_at          | timestamptz          |                                                  |

**Constraints:** Unique on `(user_id, issued_month)` — one voucher per member per month.
**RLS:** User sees own. `bomy_ops`/`bomy_admin` see all.

**Note on random_myr:** Amount is resolved (rolled) at issuance time and stored in `random_resolved_sen`. The buyer sees the actual amount from the start — no surprise at checkout. The `platform_config` keys `voucher_monthly_random_min_sen` / `voucher_monthly_random_max_sen` bound the range.

#### goodie_box_dispatches

One row per active #1 member per quarter.

| Column           | Type                    | Notes                             |
| ---------------- | ----------------------- | --------------------------------- |
| id               | uuid PK                 |                                   |
| user_id          | uuid → users            |                                   |
| quarter          | text                    | "YYYY-Q{1-4}" e.g. "2026-Q2"      |
| status           | dispatch_status         | default: pending                  |
| shipping_name    | text                    | Snapshot of member's display name |
| shipping_address | jsonb                   | Snapshot of delivery address      |
| tracking_number  | text nullable           | Entered by admin post-dispatch    |
| carrier          | text default 'pos_laju' |                                   |
| dispatched_at    | timestamptz nullable    |                                   |
| notes            | text nullable           | Admin notes                       |
| created_at       | timestamptz             |                                   |
| updated_at       | timestamptz             |                                   |

**Constraints:** Unique on `(user_id, quarter)`.
**RLS:** User sees own dispatches. `bomy_ops`/`bomy_admin` manage all.

### 3.3 platform_config New Keys

| Key                                 | Default     | Notes                            |
| ----------------------------------- | ----------- | -------------------------------- |
| `platform_membership_price_myr_sen` | 7500        | Already seeded in migration 0001 |
| `voucher_monthly_type`              | `fixed_myr` |                                  |
| `voucher_monthly_fixed_sen`         | 500         | RM5                              |
| `voucher_monthly_pct`               | 10          | 10%                              |
| `voucher_monthly_random_min_sen`    | 200         | RM2                              |
| `voucher_monthly_random_max_sen`    | 1000        | RM10                             |

### 3.4 Ledger Entries on Payment

**Platform membership charge (revenue_source = platform_subscription):**

- 1 credit row: `+price_myr_sen`, ref = `member_subscription_id`

**Brand subscription charge** — webhook computes `net = price_myr_sen − hitpay_fee_sen`,
then `brand_payout_sen = net × 90 %` and `bomy_commission_sen = net × 10 %`.
One transaction, three legs:

- 1 credit row: `+price_myr_sen`, `revenue_source = brand_subscription`
- 1 debit row: `-brand_payout_sen`, `revenue_source = brand_subscription`, ref = `brand_subscription_id`
- 1 debit row: `-hitpay_fee_sen`, `revenue_source = processing_fee`

The remaining `bomy_commission_sen` is BOMY's net take. The three debit
legs sum to `price_myr_sen`, so the journal balances.

---

## 4. packages/hitpay

New package. No official Node.js SDK — hand-rolled TypeScript client.

```
packages/hitpay/
  src/
    client.ts     — HitPayClient class
    types.ts      — DTOs: PaymentRequest, RecurringBilling, Charge, Transfer, Refund
    webhook.ts    — verifySignature(rawBody, signature, salt): boolean
    errors.ts     — HitPayError extends Error
    index.ts      — re-exports
  package.json
  tsconfig.json
```

### HitPayClient methods

| Method                             | HitPay endpoint                     | Used for                           |
| ---------------------------------- | ----------------------------------- | ---------------------------------- |
| `createPaymentRequest(input)`      | `POST /v1/payment-requests`         | Brand subscription one-time charge |
| `createRecurringBilling(input)`    | `POST /v1/recurring-billing`        | Platform membership annual         |
| `cancelRecurringBilling(id)`       | `DELETE /v1/recurring-billing/{id}` | Membership cancellation            |
| `createRefund(input)`              | `POST /v1/refund`                   | Future refund flow                 |
| `createTransfer(input)`            | `POST /v1/transfers`                | Brand payout (admin-triggered)     |
| `verifyWebhookSignature(raw, sig)` | —                                   | HMAC-SHA256 with salt key          |

Constructor accepts `{ apiKey, saltKey, baseUrl }` — all from env vars.

---

## 5. apps/api — Webhook Handler

**Route:** `POST /webhooks/hitpay`
**Auth:** None (public endpoint). Security via HMAC signature verification.

```
src/routes/webhooks/hitpay.ts
```

**Processing order:**

1. Preserve raw body (register `application/json` content type parser that saves raw buffer)
2. Verify `Hitpay-Signature` header using `verifyWebhookSignature(rawBody, sig)` → 401 if invalid
3. Parse `Hitpay-Event-Type` header
4. Idempotency check: look up `hitpay_payment_id` in relevant table — if found, return 200 immediately
5. Route by event type:

| Event                                    | Action                                                    |
| ---------------------------------------- | --------------------------------------------------------- |
| `charge.created` (recurring context)     | Activate/renew `member_subscriptions`, write ledger entry |
| `payment_request.completed`              | Activate `brand_subscriptions`, write 2 ledger entries    |
| `payment_request.failed`                 | Set `status = payment_failed`                             |
| `recurring_billing.subscription_updated` | Sync status (cancelled/paused/expired)                    |
| `charge.updated` (refund)                | Record refund ledger entry                                |

6. Always return `200 OK` — prevents HitPay retry on slow DB writes.

**Local dev:** Use ngrok (`ngrok http 3001`) to expose webhook to HitPay sandbox. Set `HITPAY_WEBHOOK_URL` in `.env`.

---

## 6. Background Jobs (BullMQ)

Three new jobs registered in apps/api scheduler.

### VoucherIssuanceJob

- **Schedule:** Cron `0 8 1 * *` (1st of month, 08:00 MYT = 00:00 UTC)
- **Manual trigger:** Admin UI button → queue job immediately
- **Logic:** Read voucher config from `platform_config` → query active `member_subscriptions` → skip users with existing voucher for `issued_month` → generate unique codes → bulk insert `vouchers` rows with `expires_at = end of month` → stub email (console.log)

### MembershipRenewalNotificationJob

- **Schedule:** Cron `0 9 * * *` (daily 09:00 MYT)
- **Logic:** Query `member_subscriptions` where `status = active` and `period_end` falls within 30/14/7/1 days → skip if day already in `notified_days` → stub email → append day to `notified_days`

### BrandSubscriptionExpiryJob

- **Schedule:** Cron `5 0 * * *` (daily 00:05 MYT)
- **Logic:** Update `brand_subscriptions` set `status = expired` where `period_end < now()` and `status = active`

---

## 7. apps/web — New Routes

| Route                                  | Auth gate        | Purpose                                                                                                                        |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /membership`                      | public           | Tier comparison landing. Pricing, benefits, CTA.                                                                               |
| `POST /membership/join`                | logged in        | Server action: create pending subscription, initiate HitPay recurring billing, redirect to checkout.                           |
| `GET /membership/success`              | logged in        | Post-payment return. Polls subscription status (2s interval, 10s max). Shows activation confirmation or "check back" fallback. |
| `GET /membership/manage`               | active #1 member | Renewal date, Goodie Box status, current voucher. Cancel link.                                                                 |
| `POST /membership/cancel`              | active #1 member | Server action: cancel HitPay recurring billing, set `cancelled_at`. Membership stays active until `period_end`.                |
| `GET /brands/[slug]/subscribe`         | logged in        | Brand subscription page. Plan selector (3/6/12 mo). Benefit display. Checkout initiation.                                      |
| `GET /brands/[slug]/subscribe/success` | logged in        | Post-payment success with polling.                                                                                             |
| `GET /account/subscriptions`           | logged in        | New tab on /account. Lists all brand subscriptions (active + expired), discount %, term end date.                              |

**auth.config.ts additions:**

- `/membership/manage` → requires active `member_subscriptions` row (checked in middleware or layout)
- `/membership/cancel` → same gate

### Member discount at checkout

When a buyer has an active `brand_subscriptions` row for the seller they are purchasing from:

- Checkout server action reads `discount_pct` from the active `brand_subscriptions` row
- Applies discount to order subtotal (not to shipping)
- Mutual exclusion: if a platform #1 voucher is also applied, buyer must choose one
- Commission (25%) is calculated on the **discounted price** (brand absorbs cost per locked decision)

---

## 8. apps/admin — New Routes

| Route                      | Purpose                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /memberships`         | Platform membership roster. Filter by status. Manual activate/deactivate.                                        |
| `GET /memberships/[id]`    | Member detail: subscription history, ledger entries, vouchers, Goodie Box dispatches.                            |
| `GET /brand-subscriptions` | All #2 subscriptions. Filter by store/status. "Trigger Payout" → HitPay Transfers API.                           |
| `GET /goodie-box`          | Quarter selector → generate dispatch list → enter tracking numbers → bulk Pos Laju CSV export → mark dispatched. |
| `GET /vouchers`            | Configure next month type + amount. "Issue now" manual trigger. Redemption rate by month.                        |
| `GET /brand-plans`         | Approve/reject brand subscription plans before they go live (`is_active`).                                       |

### apps/web seller addition

| Route                                 | Purpose                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /seller/dashboard/subscriptions` | Seller's brand plans + subscriber count + payout history. Create/edit plans (submitted for admin approval). |

---

## 9. New Environment Variables

| Variable             | Where                          | Notes                                                                                                                                                            |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HITPAY_API_KEY`     | apps/api, apps/web, apps/admin | From HitPay Dashboard → Settings → API Keys                                                                                                                      |
| `HITPAY_SALT`        | apps/api                       | Separate salt key for webhook HMAC verification                                                                                                                  |
| `HITPAY_API_URL`     | apps/api, apps/web, apps/admin | `https://api.sandbox.hit-pay.com` (dev) / `https://api.hit-pay.com` (prod)                                                                                       |
| `HITPAY_WEBHOOK_URL` | apps/api, apps/web (opt.)      | Public URL for POST /webhooks/hitpay (ngrok in local dev). apps/web uses it as a per-request override; HitPay dashboard global webhook is the fallback if unset. |
| `APP_URL`            | apps/web                       | Base URL for HitPay post-payment redirect callbacks. Required — joinMembership throws if neither APP_URL nor NEXTAUTH_URL is set.                                |

---

## 10. PR Breakdown (Stage 4)

Proposed sequence — each PR is independently reviewable:

| PR  | Branch                               | Scope                                                                                                             | Model  |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------ |
| #18 | `feat/membership-schema`             | packages/db migration: 4 new tables + 2 new enums + platform_config seeds. RLS policies. Integration tests.       | Opus   |
| #19 | `feat/hitpay-package`                | packages/hitpay: typed client, webhook verifier, all DTOs. Unit tests with mocked fetch.                          | Sonnet |
| #20 | `feat/membership-webhook`            | apps/api: POST /webhooks/hitpay handler. Idempotency. All 5 event types. Integration test with real DB.           | Sonnet |
| #21 | `feat/platform-membership-web`       | apps/web: /membership landing, /membership/join, /membership/success, /membership/manage, /membership/cancel.     | Sonnet |
| #22 | `feat/brand-subscription-web`        | apps/web: /brands/[slug]/subscribe + success. /account/subscriptions tab. Member discount at checkout.            | Sonnet |
| #23 | `feat/membership-admin`              | apps/admin: /memberships, /brand-subscriptions + payout trigger, /goodie-box, /vouchers, /brand-plans.            | Sonnet |
| #24 | `feat/seller-subscription-dashboard` | apps/web seller: /seller/dashboard/subscriptions. Brand plan creation/edit flow.                                  | Sonnet |
| #25 | `feat/membership-jobs`               | BullMQ jobs: VoucherIssuanceJob, MembershipRenewalNotificationJob, BrandSubscriptionExpiryJob. Cron registration. | Sonnet |

---

## 11. Hard Constraints (from proposal — must not violate)

- All monetary values stored as bigint (sen). Never floats.
- Commission is **net-of-fees** (revised 2026-05-01). `net = gross − hitpay_fee`. Regular orders: BOMY = `net × 25 %`. Brand subscriptions: BOMY = `net × 10 %`. The brand-subscription `CHECK` constraint enforces `commission + payout + fee = price` on every active row, so the journal always balances.
- No voucher stacking: platform voucher and brand discount mutually exclusive per checkout.
- `random_myr` voucher amount resolved at issuance, not at redemption.
- Brand subscription plan changes do not affect existing active subscriptions (all values snapshotted).
- Webhook handler must be idempotent — check `hitpay_payment_id` before any write.
- RLS enabled + FORCE on all new tables from migration 0.
- No secrets in repo. `HITPAY_API_KEY` and `HITPAY_SALT` in `.env` only.
