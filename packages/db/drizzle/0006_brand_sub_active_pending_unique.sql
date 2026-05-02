-- Migration 0006: prevent duplicate active/pending brand subscriptions per user+store
--
-- A user can hold at most one active or in-flight (pending) subscription per
-- store at any time. Without this index, two concurrent subscribe requests can
-- both pass the app-level guard and create two pending rows + two HitPay payment
-- requests. The partial index covers only active/pending rows so historical
-- expired/cancelled rows from previous subscription periods are untouched.
--
-- The web action catches 23505 on INSERT and converts it to a redirect to the
-- success page (same pattern as member_subscriptions_pending_user_unique_idx).

CREATE UNIQUE INDEX IF NOT EXISTS brand_subscriptions_active_pending_user_store_idx
  ON brand_subscriptions (user_id, store_id)
  WHERE status IN ('active', 'pending');
