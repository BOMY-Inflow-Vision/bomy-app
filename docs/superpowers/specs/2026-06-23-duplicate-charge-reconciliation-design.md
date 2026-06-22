# Double-Charge Refund & Reconciliation — Design

**Date:** 2026-06-23
**Owner:** Charlie · **Author:** Andy
**Status:** Approved for planning
**Related:** PR #69 (membership pending-trap), PR #71 (brand-sub pending-trap). This
feature consumes the duplicate-charge signal those PRs emit.

## Problem

A customer can be charged **twice for one entitlement** via the abandoned-checkout
race that #69/#71 guard against:

1. User opens HitPay checkout **A** (a live payment request), backs out without
   paying but leaves the tab open → pending row A.
2. After the 30-minute grace they re-subscribe → row A expired, checkout **B**
   created; they pay **B** → entitlement granted (one subscription).
3. The still-open checkout **A** later completes → HitPay charges the card a
   **second time**.
4. The webhook for payment A lands on a row that is no longer `pending`. Our guard
   correctly **refuses to reactivate** it (no second entitlement) and today only
   emits `log.error(... needs refund/reconciliation)` and stamps `hitpay_payment_id`.

Membership has the same path plus a second trigger: HitPay **recurring billing**
charging while the user is already active via a different checkout
(`apps/api/src/routes/webhooks/hitpay.ts:244`). Brand-sub site:
`apps/api/src/routes/webhooks/hitpay.ts:536`.

Net: the extra charge is real money taken for nothing. Today there is **no durable
record, no admin surface, no refund path, and no ledger entry** for it — and the
existing reactive refund handler would, if a refund happened, debit `revenue:…`
with no offsetting credit (the duplicate was never booked as revenue), driving
revenue **negative**.

## Goals / Non-goals

**Goals**

- Persist every detected duplicate charge as a durable, idempotent record.
- Book the duplicate inflow to a **liability** account so the ledger reconciles.
- Surface duplicates on the existing admin reconciliation page.
- Let an authorised admin issue a **one-click, full-amount** HitPay refund.
- On refund confirmation, clear the liability — never touching revenue, seller
  payout, or entitlement.

**Non-goals (YAGNI)**

- Partial refunds (a duplicate is always the full sub price).
- Auto-refund without a human (irreversible money movement stays admin-gated).
- A `dismissed` / false-positive workflow (left to manual DB action for now;
  would be a follow-up enum value + button).
- Refunds for any charge class other than these two duplicate-charge sites.

## Decisions (locked)

- **Refund trigger:** admin-reviewed, one-click. Detection + liability booking +
  reconciliation are automated; the irreversible `createRefund()` call is
  human-gated, matching BOMY's `payment_review_required` / admin-actioned-payout
  pattern.
- **Record store:** dedicated `duplicate_charges` table = source of truth.
- **Ledger:** dedicated liability account `liability:duplicate_charge_payable`,
  credited at detection, debited at refund confirmation; nets to zero per resolved
  duplicate. New `revenue_source` enum value `duplicate_charge` (not overloading
  `refund`, to keep reporting clean).
- **`handleRefund` becomes duplicate-aware, checked _before_ the existing
  member/brand revenue-refund path.**
- **Admin surface:** new section on existing `/payouts/reconciliation`.

## Data model

### New table `duplicate_charges`

| column              | type                                                         | notes                                                     |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `id`                | `uuid` PK default random                                     |                                                           |
| `subscription_type` | `text`                                                       | CHECK in (`'member_subscription'`,`'brand_subscription'`) |
| `subscription_id`   | `uuid` not null                                              | the non-honoured subscription row                         |
| `user_id`           | `uuid` not null                                              | charged customer                                          |
| `hitpay_payment_id` | `text` not null                                              | the duplicate charge's payment id                         |
| `amount_sen`        | `bigint` not null                                            | full charge amount (minor units)                          |
| `currency`          | `currency` enum not null                                     | `MYR`                                                     |
| `status`            | `duplicate_charge_status` enum not null default `'detected'` |                                                           |
| `hitpay_refund_id`  | `text` null                                                  | set when a refund is issued                               |
| `resolved_by`       | `uuid` null                                                  | admin who initiated the refund                            |
| `detected_at`       | `timestamptz` not null default now                           |                                                           |
| `resolved_at`       | `timestamptz` null                                           | set when status → `refunded`                              |

**New enum** `duplicate_charge_status`: `detected` → `refund_pending` → `refunded`.

**Constraints / indexes**

- CHECK `amount_sen > 0`.
- CHECK `subscription_type IN ('member_subscription','brand_subscription')`.
- UNIQUE `hitpay_payment_id` — idempotency anchor; one record per duplicate charge.
- Partial UNIQUE `hitpay_refund_id WHERE hitpay_refund_id IS NOT NULL` — one record
  per refund id.
- INDEX on `status` (admin work-list query: `WHERE status IN ('detected','refund_pending')`).

### RLS (mirrors `admin_bypass_audit`, plus UPDATE since we mutate status)

`ENABLE` + `FORCE` ROW LEVEL SECURITY, then:

- **Default-deny (RESTRICTIVE):**
  `USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass())`.
- **Staff read (SELECT):** `USING (app.is_bomy_staff() OR app.is_admin_bypass())`.
- **Bypass insert (INSERT):** `WITH CHECK (app.is_admin_bypass())`.
- **Bypass update (UPDATE):**
  `USING (app.is_admin_bypass()) WITH CHECK (app.is_admin_bypass())`.

No DELETE policy (records are permanent). All writes (webhook detection, admin
refund) run through `withAdmin` (bypass); the admin reconciliation read already
runs through `withAdmin`/`SYSTEM_ACTOR`.

### Enum / `revenue_source`

Add `duplicate_charge` to `REVENUE_SOURCES` (`packages/db/src/types.ts`) and the
`revenue_source` pg enum via migration. Ledger account string (free text):
`liability:duplicate_charge_payable`.

### Migration

`packages/db/drizzle/0016_duplicate_charge_reconciliation.sql`, registered in
`packages/db/scripts/migrate.mjs`. Contents: `ALTER TYPE revenue_source ADD VALUE
'duplicate_charge'`; `CREATE TYPE duplicate_charge_status`; `CREATE TABLE
duplicate_charges` with constraints/indexes; the four RLS policies. Add the policy
text to `packages/db/src/rls/policies.sql` (canonical reference) too.

**Grants (required):** like every new table in this repo (see
`0008_admin_bypass_audit.sql`), the `bomy_app` role gets no privileges by default,
so app/webhook/admin code fails even under `withAdmin` without an explicit grant.
Add — wrapped in the same role-existence `DO` block as 0008 —
`GRANT SELECT, INSERT, UPDATE, DELETE ON "duplicate_charges" TO bomy_app;`.

> **Migration risk:** `ALTER TYPE … ADD VALUE` is only _used_ at runtime, never
> within this migration, so it is safe inside a transaction on PG12+ (docker is
> PG16). Verify `migrate.mjs` does not error on it during planning.

## Component 1 — Detection (apps/api webhook)

At both sites (`hitpay.ts:244` membership already-active; `hitpay.ts:536` brand-sub
non-pending), inside the existing `withAdmin` transaction, keep the
`hitpay_payment_id` stamp and replace the bare `log.error` with:

1. `INSERT INTO duplicate_charges (subscription_type, subscription_id, user_id,
hitpay_payment_id, amount_sen, currency, status='detected')`
   **`ON CONFLICT (hitpay_payment_id) DO NOTHING RETURNING id`** — idempotent on
   webhook retry.
2. **Only when the insert created a row** (RETURNING non-empty): write one ledger
   leg — **credit** `liability:duplicate_charge_payable`, `amount_minor = amount_sen`,
   `revenue_source = 'duplicate_charge'`, `reference_id = duplicate_charges.id`,
   `reference_type = 'duplicate_charge'`, idempotency key
   `dup_charge:${paymentId}:credit`.
3. Keep an informational `log.warn`/`log.error` for observability.

No activation, no revenue credit, no payout/fee legs. A retried webhook produces no
second row and no second credit (both the `ON CONFLICT` and the ledger
`(idempotency_key, direction)` unique index enforce this).

## Component 2 — Refund initiation (apps/admin server action)

`refundDuplicateCharge(id)` in a new
`apps/admin/src/app/payouts/reconciliation/actions.ts`:

1. `requireRole(session, ["bomy_admin", "bomy_finance"])` (the existing
   `PAYOUT_ROLES`). `bomy_ops` is **not** authorised for refunds.
2. **Compare-and-swap guard (before the external call):** `UPDATE duplicate_charges
SET status='refund_pending', resolved_by=$admin WHERE id=$1 AND status='detected'
RETURNING …`. If 0 rows → another admin/webhook already handled it; abort with a
   user-facing "already being processed" result. This closes the double-click /
   double-refund window _before_ money can move.
3. Call `HitPayClient.createRefund({ payment_id, amount, reason })` (client wired as
   in `apps/admin/src/app/memberships/actions.ts`). `createRefund` expects `amount`
   as a decimal **string** (`"50.00"`), but `duplicate_charges.amount_sen` is a
   bigint — convert with `senToMyr(amount_sen)` from `apps/admin/src/lib/money.ts`
   (it returns `"N.NN"`, no `RM` prefix, exactly HitPay's format). `payment_id` is
   the record's `hitpay_payment_id`.
4. **Outcome handling (external side-effect failure story):**
   - **Success** → `UPDATE … SET hitpay_refund_id=$refundId WHERE id=$1`. Status
     stays `refund_pending`; the ledger debit + `refunded` transition happen in the
     webhook (Component 3). A crash _after_ HitPay success leaves the row
     `refund_pending` (never clickable as `detected` again) — at worst the refund id
     is unrecorded, which the webhook still reconciles by `hitpay_payment_id`.
   - **`HitPayError` (definite API rejection — refund NOT issued)** → revert with a
     CAS `UPDATE … SET status='detected', resolved_by=NULL WHERE id=$1 AND
status='refund_pending'`, surface the error so the admin can retry. (Use the
     `instanceof HitPayError` partial-mock pattern from PR #50.)
   - **Unknown/network error (outcome indeterminate)** → leave `refund_pending`,
     `log.error(... refund outcome unknown — verify in HitPay dashboard)`. Do **not**
     revert (we cannot prove the charge was not refunded). Admin sees it stuck in
     `refund_pending` for manual verification.

The action never writes the ledger debit itself — that is the webhook's job, keeping
a single idempotent debit path.

## Component 3 — `handleRefund` duplicate-aware (apps/api webhook)

In `handleRefund` (`charge.updated` with `refund_amount`), **before** the existing
membership/brand revenue-refund lookups:

1. Look up `duplicate_charges` by `hitpay_payment_id`.
2. If found, handle **idempotently across all states** and return (never fall
   through to the revenue path):
   - **Full-amount guard:** if `refundAmountSen !== duplicate.amount_sen`, do **not**
     write any ledger debit, do **not** mark refunded, and do **not** fall through to
     the revenue path — `log.error(... partial/mismatched refund on a duplicate
charge — manual review)` and return. Duplicates are full-amount by construction
     (Non-goals); a differing amount is an anomaly a human must inspect, not something
     to auto-reconcile.
   - Compute idem key `dup_charge:${paymentId}:${refundId}:debit` (or
     `dup_charge:${paymentId}:debit` when no `refund_id`).
   - If a ledger leg with that `(idempotency_key, direction='debit')` already exists
     **or** `status='refunded'` → already reconciled; log + return (idempotent).
   - Otherwise (`detected` or `refund_pending`): insert the **debit**
     `liability:duplicate_charge_payable`, `amount_minor = refundAmountSen`,
     `revenue_source='duplicate_charge'`, `reference_id = duplicate_charges.id`,
     `reference_type='duplicate_charge'`; `UPDATE duplicate_charges SET
status='refunded', resolved_at=now, hitpay_refund_id = COALESCE(hitpay_refund_id,
$refundId)`. The liability account now nets to zero for this charge.
3. If not found → existing revenue-refund path, **unchanged** (a refund of a normal,
   previously-booked sale still debits `revenue:…`).

This also covers a refund issued **manually in the HitPay dashboard** (status still
`detected` when the webhook arrives) — it reconciles the same way.

## Component 4 — Admin surface (`/payouts/reconciliation`)

New **"Duplicate charges"** section on the existing page, listing rows
`WHERE status IN ('detected','refund_pending')` ordered by `detected_at`:

| Customer | Type | Amount | Payment ID | Detected | Status | Action |
| -------- | ---- | ------ | ---------- | -------- | ------ | ------ |

- The **Refund** button renders/enables only for payout roles
  (`bomy_admin`/`bomy_finance`) — `/payouts/reconciliation` is visible to all admin
  roles (incl. `bomy_ops`), so non-payout roles see the rows **read-only** (status
  only, no button). This mirrors the server action's `requireRole` gate so the UI
  never offers an action that would be rejected; the action gate remains the
  security boundary, the UI gate is UX.
- `detected` rows (for payout roles) show the **Refund** button (calls
  `refundDuplicateCharge`).
- `refund_pending` rows show a disabled "Refund pending" state (awaiting webhook).
- Full-amount only; no partial-refund input.

Read via the page's existing `withAdmin`/`SYSTEM_ACTOR` pattern; the current
session's role gates the button.

## Data flow (happy path)

```
duplicate charge lands → webhook (detection)
  ├─ INSERT duplicate_charges (detected)            [idempotent: ON CONFLICT]
  └─ ledger CREDIT liability:duplicate_charge_payable
        ↓ surfaced on /payouts/reconciliation
admin clicks Refund → refundDuplicateCharge
  ├─ CAS detected → refund_pending                  [guards double-refund]
  ├─ HitPay createRefund()
  └─ store hitpay_refund_id
        ↓ HitPay fires charge.updated refund webhook
handleRefund (duplicate-aware, checked first)
  ├─ ledger DEBIT liability:duplicate_charge_payable  → account nets to 0
  └─ UPDATE duplicate_charges → refunded, resolved_at
```

## Testing

Integration (real Postgres + RLS), TDD:

1. **Detection** (both sites) creates exactly one `duplicate_charges` row +
   one liability **credit**.
2. **Idempotency** — retried/duplicate webhook → still one row, one credit.
3. **Refund webhook for a duplicate** → liability **debit**, status `refunded`,
   `resolved_at` set, and **no** revenue debit.
4. **Refund webhook for a normal payment** → existing **revenue** path, unchanged.
5. **Paid-then-expired original payment id not clobbered** (carried from #71).
6. **`handleRefund` idempotency across states** — duplicate refund webhook when
   already `refunded` → no second debit; when `detected` (manual HitPay refund) →
   reconciles to `refunded`.
7. **Full-amount guard** — refund webhook for a duplicate with `refundAmountSen !==
amount_sen` → no liability debit, status unchanged, no revenue debit (left for
   manual review).
8. **Admin `refundDuplicateCharge`:** CAS `detected → refund_pending`, calls
   `createRefund` once, stores `hitpay_refund_id`; no-op (no API call) when not
   `detected`; `HitPayError` reverts to `detected`; role gate rejects `bomy_ops`.

## Files (anticipated)

- `packages/db/src/schema/duplicate_charges.ts` (new) + `schema/index.ts`,
  `schema/enums.ts` (status enum), `src/types.ts` (`REVENUE_SOURCES`).
- `packages/db/drizzle/0016_duplicate_charge_reconciliation.sql` (new) +
  `scripts/migrate.mjs` + `src/rls/policies.sql`.
- `apps/api/src/routes/webhooks/hitpay.ts` (detection at 2 sites + duplicate-aware
  `handleRefund`).
- `apps/admin/src/app/payouts/reconciliation/page.tsx` (new section) + a
  `reconciliation/actions.ts` (`refundDuplicateCharge`).
- Tests: `apps/api/tests/webhooks/hitpay.test.ts` (detection + refund), admin action
  test under `apps/admin/tests/`.
