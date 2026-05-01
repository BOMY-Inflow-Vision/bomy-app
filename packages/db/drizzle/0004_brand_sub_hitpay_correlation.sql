-- Migration 0004: split brand_subscriptions HitPay correlation fields
--
-- Separates the payment-request ID (set at checkout initiation) from the
-- charge/payment ID (set by the webhook on activation). Previously both
-- were stored in a single hitpay_payment_id column, which broke webhook
-- idempotency: after activation the payment_request_id was overwritten,
-- so a HitPay retry carrying the same payment_request_id could not find
-- the row and the status === 'active' guard was never reached.
--
-- hitpay_payment_request_id: set at checkout by the web action (PR #22)
-- hitpay_payment_id:         set by the webhook on first activation
-- Partial unique index on payment_request_id enforces one-row-per-checkout.

ALTER TABLE brand_subscriptions ADD COLUMN IF NOT EXISTS hitpay_payment_request_id text;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS brand_subscriptions_payment_request_unique_idx
  ON brand_subscriptions (hitpay_payment_request_id)
  WHERE hitpay_payment_request_id IS NOT NULL;
