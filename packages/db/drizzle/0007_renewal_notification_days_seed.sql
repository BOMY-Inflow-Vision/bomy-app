-- Migration 0007: seed renewal_notification_days into platform_config
--
-- MembershipRenewalNotificationJob reads this key so the notification schedule
-- is admin-configurable without a deploy. Edit via apps/admin /memberships
-- "Renewal Notification Settings" form.
--
-- ON CONFLICT DO NOTHING so re-runs and existing custom values are safe.

INSERT INTO "platform_config" ("key", "value", "description")
VALUES (
  'renewal_notification_days',
  to_jsonb(ARRAY[30, 14, 7, 1]::int[]),
  'Days before membership expiry at which renewal reminder emails are sent. Must be a descending array of positive integers, e.g. [30,14,7,1].'
)
ON CONFLICT ("key") DO NOTHING;
