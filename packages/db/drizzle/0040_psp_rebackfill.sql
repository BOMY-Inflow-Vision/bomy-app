-- Migration 0040: re-run the 0039 HitPay → psp_* backfill (Stripe as a second PSP, PR 2).
--
-- Design: docs/superpowers/specs/2026-11-24-psp-stripe-design.md §4.1 (expand/contract).
--
-- 0039 added the psp_* columns and copied the hitpay_* values across. Code deployed between
-- 0039 and PR 2 still wrote hitpay_* only, so rows written in that window have empty psp_*
-- columns. PR 2's HitPay code dual-writes both, and shared readers now read psp_*. This file
-- copies the window's rows across once more.
--
-- Data only: no DDL, no new columns, indexes, constraints or policies, so no RLS / grant change
-- and nothing for IF NOT EXISTS to guard. checkout_enabled and active_psp are not touched.
--
-- Idempotent: COALESCE never overwrites a psp_* value already written, and each WHERE only
-- matches rows that still have something to copy, so a second run updates 0 rows. Restricted to
-- psp_provider = 'hitpay' so a provider-neutral row can never inherit a HitPay id. Atomic: one
-- transaction, like 0039.
--
-- Apply to Neon AFTER the PR 2 api (Railway) and web/admin (Vercel) deploys are live, so no
-- single-writer code is left to write fresh hitpay_*-only rows behind it. Order relative to the
-- merge is otherwise free: nothing in PR 2 reads an object this file creates, and the money
-- guards (abandon CAS, reaper, isPendingAbandoned) check both payment-id columns.

BEGIN;

UPDATE member_subscriptions
   SET psp_recurring_id = COALESCE(psp_recurring_id, hitpay_recurring_id),
       psp_payment_id   = COALESCE(psp_payment_id, hitpay_payment_id)
 WHERE psp_provider = 'hitpay'
   AND ((psp_recurring_id IS NULL AND hitpay_recurring_id IS NOT NULL)
     OR (psp_payment_id IS NULL AND hitpay_payment_id IS NOT NULL));

UPDATE brand_subscriptions
   SET psp_payment_request_id = COALESCE(psp_payment_request_id, hitpay_payment_request_id),
       psp_payment_id         = COALESCE(psp_payment_id, hitpay_payment_id),
       psp_fee_sen            = COALESCE(psp_fee_sen, hitpay_fee_sen)
 WHERE psp_provider = 'hitpay'
   AND ((psp_payment_request_id IS NULL AND hitpay_payment_request_id IS NOT NULL)
     OR (psp_payment_id IS NULL AND hitpay_payment_id IS NOT NULL)
     OR (psp_fee_sen IS NULL AND hitpay_fee_sen IS NOT NULL));

UPDATE duplicate_charges
   SET psp_payment_id = COALESCE(psp_payment_id, hitpay_payment_id),
       psp_refund_id  = COALESCE(psp_refund_id, hitpay_refund_id)
 WHERE psp_provider = 'hitpay'
   AND ((psp_payment_id IS NULL AND hitpay_payment_id IS NOT NULL)
     OR (psp_refund_id IS NULL AND hitpay_refund_id IS NOT NULL));

COMMIT;
