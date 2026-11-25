-- Migration 0039: provider-neutral PSP columns (Stripe as a second PSP, PR 1).
--
-- Design: docs/superpowers/specs/2026-11-24-psp-stripe-design.md §4.1 / §4.2.
--
-- Expand-only. Every Stage 4 table that names HitPay gets parallel psp_* columns plus a pinned
-- psp_provider (default 'hitpay'), and the existing hitpay_* values are copied across. Nothing is
-- renamed or dropped: code deployed before this migration never sees the new columns and keeps
-- working, and the HitPay webhook keeps correlating on hitpay_*. A later "contract" migration drops
-- the defaults / old columns once the HitPay decision is made.
--
--   member_subscriptions  psp_provider, psp_recurring_id, psp_payment_id, psp_checkout_id,
--                         psp_customer_id (+ backfill, recurring index, checkout unique index)
--   brand_subscriptions   psp_provider, psp_payment_request_id, psp_payment_id, psp_fee_sen,
--                         psp_paid_at (+ backfill, request unique index). The split CHECK is
--                         rewritten to accept the fee in either column (COALESCE), and a new
--                         fee-sync CHECK stops the two fee columns drifting while HitPay code
--                         dual-writes them.
--   duplicate_charges     psp_provider, psp_payment_id, psp_refund_id, psp_fee_sen (+ backfill,
--                         two unique indexes). hitpay_payment_id becomes nullable; a CHECK keeps
--                         "at least one payment reference" true.
--   checkout_sessions     psp_paid_at, psp_async_pending_since; the payment-review reason CHECK is
--                         widened with psp_fee_unavailable and psp_async_timeout.
--   platform_config       seeds active_psp = "hitpay" and subscriptions_enabled = false.
--
-- No new tables, so no RLS policy or grant change: the policies are row predicates that do not
-- name these columns, and bomy_app's grants are table-level (0027). rls/policies.sql is untouched.
-- checkout_enabled is not touched.
--
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS / COALESCE backfills) and atomic: the whole file
-- runs in one transaction, so the split CHECK is never absent between its DROP and ADD.

BEGIN;

-- ─── member_subscriptions ────────────────────────────────────────────────────

ALTER TABLE member_subscriptions
  ADD COLUMN IF NOT EXISTS psp_provider     psp_provider NOT NULL DEFAULT 'hitpay',
  ADD COLUMN IF NOT EXISTS psp_recurring_id text,
  ADD COLUMN IF NOT EXISTS psp_payment_id   text,
  ADD COLUMN IF NOT EXISTS psp_checkout_id  text,
  ADD COLUMN IF NOT EXISTS psp_customer_id  text;

-- Copy HitPay ids across without ever overwriting a psp_* value already written (safe to re-run;
-- PR 2's 0040 re-runs the same backfill for rows written in the deploy window).
UPDATE member_subscriptions
   SET psp_recurring_id = COALESCE(psp_recurring_id, hitpay_recurring_id),
       psp_payment_id   = COALESCE(psp_payment_id, hitpay_payment_id)
 WHERE (psp_recurring_id IS NULL AND hitpay_recurring_id IS NOT NULL)
    OR (psp_payment_id IS NULL AND hitpay_payment_id IS NOT NULL);

-- Not unique: renewals are separate rows that share the recurring id.
CREATE INDEX IF NOT EXISTS member_subscriptions_psp_recurring_idx
  ON member_subscriptions (psp_provider, psp_recurring_id)
  WHERE psp_recurring_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS member_subscriptions_psp_checkout_unique_idx
  ON member_subscriptions (psp_provider, psp_checkout_id)
  WHERE psp_checkout_id IS NOT NULL;

-- ─── brand_subscriptions ─────────────────────────────────────────────────────

ALTER TABLE brand_subscriptions
  ADD COLUMN IF NOT EXISTS psp_provider           psp_provider NOT NULL DEFAULT 'hitpay',
  ADD COLUMN IF NOT EXISTS psp_payment_request_id text,
  ADD COLUMN IF NOT EXISTS psp_payment_id         text,
  ADD COLUMN IF NOT EXISTS psp_fee_sen            bigint,
  ADD COLUMN IF NOT EXISTS psp_paid_at            timestamptz;  -- Stripe: paid, fee not yet known (§6)

UPDATE brand_subscriptions
   SET psp_payment_request_id = COALESCE(psp_payment_request_id, hitpay_payment_request_id),
       psp_payment_id         = COALESCE(psp_payment_id, hitpay_payment_id),
       psp_fee_sen            = COALESCE(psp_fee_sen, hitpay_fee_sen)
 WHERE (psp_payment_request_id IS NULL AND hitpay_payment_request_id IS NOT NULL)
    OR (psp_payment_id IS NULL AND hitpay_payment_id IS NOT NULL)
    OR (psp_fee_sen IS NULL AND hitpay_fee_sen IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS brand_subscriptions_psp_request_unique_idx
  ON brand_subscriptions (psp_provider, psp_payment_request_id)
  WHERE psp_payment_request_id IS NOT NULL;

-- The split CHECK named hitpay_fee_sen. Replace it with one that holds for old writers (fee in
-- hitpay_fee_sen only), dual-writing HitPay code (both, equal) and Stripe code (psp_fee_sen only).
ALTER TABLE brand_subscriptions DROP CONSTRAINT IF EXISTS brand_subscriptions_split_chk;
ALTER TABLE brand_subscriptions ADD CONSTRAINT brand_subscriptions_split_chk CHECK (
  status <> 'active' OR (
    COALESCE(psp_fee_sen, hitpay_fee_sen) IS NOT NULL
    AND bomy_commission_sen + brand_payout_sen + COALESCE(psp_fee_sen, hitpay_fee_sen) = price_myr_sen
  )
) NOT VALID;
ALTER TABLE brand_subscriptions VALIDATE CONSTRAINT brand_subscriptions_split_chk;

-- Keep the two fee columns from drifting while HitPay code writes both.
ALTER TABLE brand_subscriptions DROP CONSTRAINT IF EXISTS brand_subscriptions_fee_sync_chk;
ALTER TABLE brand_subscriptions ADD CONSTRAINT brand_subscriptions_fee_sync_chk CHECK (
  psp_fee_sen IS NULL OR hitpay_fee_sen IS NULL OR psp_fee_sen = hitpay_fee_sen
) NOT VALID;
ALTER TABLE brand_subscriptions VALIDATE CONSTRAINT brand_subscriptions_fee_sync_chk;

-- ─── duplicate_charges ───────────────────────────────────────────────────────

ALTER TABLE duplicate_charges
  ADD COLUMN IF NOT EXISTS psp_provider   psp_provider NOT NULL DEFAULT 'hitpay',
  ADD COLUMN IF NOT EXISTS psp_payment_id text,
  ADD COLUMN IF NOT EXISTS psp_refund_id  text,
  ADD COLUMN IF NOT EXISTS psp_fee_sen    bigint,  -- Stripe keeps its fee on refund (§9)
  ALTER COLUMN hitpay_payment_id DROP NOT NULL;

UPDATE duplicate_charges
   SET psp_payment_id = COALESCE(psp_payment_id, hitpay_payment_id),
       psp_refund_id  = COALESCE(psp_refund_id, hitpay_refund_id)
 WHERE (psp_payment_id IS NULL AND hitpay_payment_id IS NOT NULL)
    OR (psp_refund_id IS NULL AND hitpay_refund_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS duplicate_charges_psp_payment_unique_idx
  ON duplicate_charges (psp_provider, psp_payment_id)
  WHERE psp_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS duplicate_charges_psp_refund_unique_idx
  ON duplicate_charges (psp_provider, psp_refund_id)
  WHERE psp_refund_id IS NOT NULL;

-- hitpay_payment_id is no longer NOT NULL (Stripe rows will not have one); every row still needs a
-- payment reference. psp_payment_id becomes NOT NULL only in the contract migration.
ALTER TABLE duplicate_charges DROP CONSTRAINT IF EXISTS duplicate_charges_payment_ref_chk;
ALTER TABLE duplicate_charges ADD CONSTRAINT duplicate_charges_payment_ref_chk
  CHECK (hitpay_payment_id IS NOT NULL OR psp_payment_id IS NOT NULL);

-- ─── checkout_sessions ───────────────────────────────────────────────────────

ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS psp_paid_at             timestamptz,  -- Stripe: paid, awaiting fee (§6)
  ADD COLUMN IF NOT EXISTS psp_async_pending_since timestamptz;  -- Stripe: completed, async method unpaid (§6.1)

-- Widen only: every value accepted before is still accepted.
ALTER TABLE checkout_sessions DROP CONSTRAINT IF EXISTS checkout_sessions_payment_review_reason_chk;
ALTER TABLE checkout_sessions ADD CONSTRAINT checkout_sessions_payment_review_reason_chk CHECK (
  payment_review_reason IS NULL OR payment_review_reason IN (
    'amount_mismatch',
    'invalid_commission_config',
    'voucher_claim_failed',
    'psp_fee_unavailable',
    'psp_async_timeout'
  )
) NOT VALID;
ALTER TABLE checkout_sessions VALIDATE CONSTRAINT checkout_sessions_payment_review_reason_chk;

-- ─── platform_config seeds ───────────────────────────────────────────────────
-- ON CONFLICT DO NOTHING: re-runs never overwrite a value an admin has since changed.

INSERT INTO platform_config (key, value, description)
VALUES (
  'active_psp',
  '"hitpay"'::jsonb,
  'PSP used for NEW payments: "hitpay" | "stripe". Existing rows keep their own psp_provider. Change via admin /config.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_config (key, value, description)
VALUES (
  'subscriptions_enabled',
  'false'::jsonb,
  'Gate for memberships and brand subscriptions on any PSP. Flip via runbook / ops script, never in code.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
