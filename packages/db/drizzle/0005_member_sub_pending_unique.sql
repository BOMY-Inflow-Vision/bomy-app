-- Migration 0005: enforce one in-flight checkout per user
--
-- The existing activeUserUnique index prevents two active rows per user.
-- Without this index, two concurrent join requests can both pass the
-- active/pending guard and create two pending rows + two HitPay recurring
-- billings. The partial index below lets the DB be the final arbiter:
-- the second INSERT gets a 23505 unique violation that the action catches
-- and converts to a /membership/success redirect.
--
-- Partial index (WHERE status = 'pending') keeps it narrow — only one
-- status value is covered, historical expired/cancelled rows are untouched.

CREATE UNIQUE INDEX IF NOT EXISTS member_subscriptions_pending_user_unique_idx
  ON member_subscriptions (user_id)
  WHERE status = 'pending';
