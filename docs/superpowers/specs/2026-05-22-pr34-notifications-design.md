# PR #34 — Notifications & Email Design

**Status:** Approved 2026-05-22  
**Branch:** `feat/notifications-email`  
**Scope anchor:** Wire real email for the four PR #32 structured log events + replace membership renewal stubs

---

## 1. Architecture

### Overview

PR #34 wires transactional email to four existing structured-log events from PR #32 and replaces the `[stub-email]` stubs in the membership renewal job. It adds no new database tables. Email delivery is fire-and-forget: the HitPay webhook response never waits on SMTP.

### Delivery pattern

`handleOrderPayment` returns an `OrderPaymentResult` value carrying `NotificationDescriptor[]` — IDs and types only, no rendered content. After `handleOrderPayment` returns and control is back in the route handler, the route calls:

```ts
void dispatchOrderNotifications(result.notifications, app).catch((err) =>
  req.log.error({ err }, "email_notification_dispatch_error"),
)
```

The HitPay webhook route returns its 200 response before any email send completes. Descriptors are emitted only after the DB path logically succeeded for that notification's trigger.

### Transport

- **Library:** nodemailer (provider-neutral SMTP)
- **Dev:** Mailhog (Docker, port 1025 SMTP / 8025 UI)
- **Production:** Resend (SMTP relay) — swappable to SES or any SMTP without code changes
- **Gate:** `EMAIL_DELIVERY_ENABLED=true` must be set explicitly; default is disabled (no mail sent, logs `email_notification_skipped`)

---

## 2. File Map

### New files

| File                                       | Responsibility                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `apps/api/src/lib/mailer.ts`               | `Mailer` interface + `createMailer` factory (nodemailer)                    |
| `apps/api/src/plugins/mailer.ts`           | Fastify plugin; validates env, decorates `app.mailer`, `onClose`            |
| `apps/api/src/notifications/types.ts`      | `NotificationDescriptor` union, `OrderPaymentResult`, `PaymentReviewReason` |
| `apps/api/src/notifications/order.ts`      | `dispatchOrderNotifications` — batch query, per-send failure isolation      |
| `apps/api/src/notifications/membership.ts` | `sendRenewalEmail(mailer, opts)`                                            |

### Modified files

| File                                                   | What changes                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `apps/api/src/webhooks/hitpay/order-fanout.ts`         | `handleOrderPayment` returns `OrderPaymentResult`; push descriptors into collector       |
| `apps/api/src/webhooks/hitpay/park-review.ts`          | Accepts `opts?: { emitNotification?: boolean }`; pushes `order_review` unless suppressed |
| `apps/api/src/webhooks/hitpay/failure-release.ts`      | Pushes `order_failed` only when UPDATE actually transitions a row                        |
| `apps/api/src/routes/webhooks/hitpay.ts`               | Fire-and-forget `dispatchOrderNotifications` after `handleOrderPayment`                  |
| `apps/api/src/jobs/membership-renewal-notification.ts` | Hydrate `users.email`; call `sendRenewalEmail`; per-row failure isolation                |
| `apps/api/src/scheduler.ts`                            | `createScheduler(db, { mailer, logger })`                                                |
| `apps/api/src/server.ts`                               | Register `mailerPlugin` before `hitpayWebhookRoutes` and before `createScheduler`        |
| `apps/api/package.json`                                | Add `nodemailer`, `@types/nodemailer`                                                    |
| `pnpm-lock.yaml`                                       | Updated by `pnpm add` for nodemailer / @types/nodemailer                                 |

---

## 3. Descriptor Types & Emission Rules

### Type definitions (`notifications/types.ts`)

```ts
export type PaymentReviewReason =
  | "amount_mismatch"
  | "invalid_commission_config"
  | "voucher_claim_failed"

export type OrderPaidDescriptor = {
  type: "order_paid"
  sessionId: string
  buyerId: string
  orderIds: string[]
  voucherClaimFailed: boolean
}

export type OrderFailedDescriptor = {
  type: "order_failed"
  sessionId: string
  buyerId: string
}

export type OrderReviewDescriptor = {
  type: "order_review"
  sessionId: string
  reason: Exclude<PaymentReviewReason, "voucher_claim_failed">
}

export type VoucherClaimDescriptor = {
  type: "voucher_claim_failed"
  sessionId: string
  voucherId: string
}

export type NotificationDescriptor =
  | OrderPaidDescriptor
  | OrderFailedDescriptor
  | OrderReviewDescriptor
  | VoucherClaimDescriptor

export type OrderPaymentResult =
  | { result: "not_order"; notifications: [] }
  | { result: "handled"; notifications: NotificationDescriptor[] }
```

### Emission rules

| Trigger                                                             | Descriptors emitted                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fanOutPaid` orders committed, no voucher issue                     | `order_paid` (voucherClaimFailed: false)                                                                                                                |
| `fanOutPaid` orders committed, voucher claim fails                  | `order_paid` (voucherClaimFailed: true), then `voucher_claim_failed`; `parkPaymentReview` called with `{ emitNotification: false }` — NO `order_review` |
| `parkPaymentReview` for amount_mismatch / invalid_commission_config | `order_review` (via `parkPaymentReview` default, `emitNotification` not false)                                                                          |
| `runFailureRelease` UPDATE transitions a row                        | `order_failed`                                                                                                                                          |
| `runFailureRelease` UPDATE is no-op (already handled)               | nothing                                                                                                                                                 |
| Idempotent replay of any path                                       | `notifications: []` — descriptors are emitted once, at the time the DB path first succeeds                                                              |

**Voucher-claim-failed design rationale:** The buyer has a confirmed order and receives `order_paid`. Ops receives the specialized `voucher_claim_failed` ops alert (with voucherId for reconciliation). A second `order_review` is suppressed because it would double-alert Ops for the same session.

---

## 4. Mailer Interface & Plugin

### `Mailer` interface (`lib/mailer.ts`)

```ts
export interface Mailer {
  sendMail(opts: { to: string | string[]; subject: string; text: string }): Promise<void>
  close(): Promise<void>
}

export interface MailerConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
  replyTo?: string
}

export function createMailer(
  config: MailerConfig,
  log: { info(obj: object, msg: string): void },
): Mailer
```

- When `enabled = false`: `sendMail` logs `email_notification_skipped` (with `to` and `subject`, no body) and resolves immediately; `close` is a no-op.
- When `enabled = true`: uses nodemailer SMTP transport. `user`+`pass` are both required or both absent (auth vs no-auth SMTP).
- `close()` calls `nodemailer.transport.close()` for graceful shutdown.

### Fastify plugin (`plugins/mailer.ts`)

- Reads and validates all `SMTP_*`, `MAIL_FROM`, `EMAIL_DELIVERY_ENABLED` env vars at startup — fails fast if required vars are missing when `EMAIL_DELIVERY_ENABLED=true`.
- Calls `createMailer(config, app.log)` and decorates `app.mailer`.
- Registers `onClose` hook that calls `app.mailer.close()`.
- Must be registered in `server.ts` **before** `hitpayWebhookRoutes` and **before** `createScheduler`.

---

## 5. Dispatcher & Email Content

### `dispatchOrderNotifications` (`notifications/order.ts`)

- Accepts `NotificationDescriptor[]` and the Fastify app instance.
- For `order_paid`: runs a **single batch query** joining `orders`, `users`, and `stores` for all `orderIds` in the descriptor — one DB round-trip to hydrate buyer email, buyer name, and all (store name, sellerPayoutSen) pairs.
- For each notification, sends independently. A failure from one `sendMail` call is caught, logged as `email_notification_failed` with `{ type, sessionId, err }`, and does not abort remaining sends.
- Uses `parseOpsEmails(env)` to read `OPS_ALERT_EMAILS`. If empty/unset, logs `email_notification_skipped` with `reason: 'missing_ops_recipients'` instead of sending.
- Uses `joinUrl(base, path)` for trailing-slash-safe URL construction from `APP_URL` and `ADMIN_URL`.

### `parseOpsEmails(env)` helper

```ts
function parseOpsEmails(env: NodeJS.ProcessEnv): string[]
// Reads OPS_ALERT_EMAILS, splits on comma, trims, drops empty strings.
```

### `joinUrl(base, path)` helper

```ts
function joinUrl(base: string, path: string): string
// Strips trailing slash from base, ensures path starts with /, concatenates.
```

### Email content

All emails are plain text (no HTML). Subject and body per notification:

**`order_paid` — buyer confirmation:**

- Subject: `Your BOMY order is confirmed`
- Body: Confirmation sentence, list of orders with store name and amount, link to `/account/orders`

**`order_paid` — seller notification (one email per store in the order):**

- Subject: `New order received on BOMY`
- Body: New order notification with payout amount, link to `/seller/dashboard/orders`

> `voucherClaimFailed: true` on an `order_paid` descriptor affects buyer/seller email context only (e.g., a note to the buyer that a voucher discount may be adjusted). It does **not** trigger an ops alert. The ops alert for voucher failures is driven exclusively by the `voucher_claim_failed` descriptor below.

**`order_failed` — buyer:**

- Subject: `Your BOMY payment could not be processed`
- Body: Apology, session context, link to `/cart` to retry

**`order_review` — ops alert:**

- Subject: `[BOMY Ops] Payment review required — {reason}`
- Body: Session ID, reason, link to `/checkout-sessions/{sessionId}` on admin

**`voucher_claim_failed` — ops alert:**

- Subject: `[BOMY Ops] Voucher claim failed for session {sessionId}`
- Body: Session ID, voucher ID, action required note, link to admin session page

**Membership renewal — buyer:**

- Subject: `Your BOMY membership renews in {daysBefore} days`
- Body: Renewal date, link to `/membership/manage`

### `sendRenewalEmail` (`notifications/membership.ts`)

```ts
export async function sendRenewalEmail(
  mailer: Mailer,
  opts: { email: string; periodEnd: Date; daysBefore: number },
): Promise<void>
```

Uses the same `mailer` instance (same `EMAIL_DELIVERY_ENABLED` gate). `APP_URL` read from `process.env` for the `/membership/manage` link.

---

## 6. Environment Variables

| Variable                 | Required     | Default | Notes                                                               |
| ------------------------ | ------------ | ------- | ------------------------------------------------------------------- |
| `EMAIL_DELIVERY_ENABLED` | No           | `false` | Must be `"true"` to send real email                                 |
| `SMTP_HOST`              | When enabled | —       | SMTP server hostname                                                |
| `SMTP_PORT`              | No           | `587`   | SMTP port                                                           |
| `SMTP_SECURE`            | No           | `false` | `"true"` for TLS (port 465)                                         |
| `SMTP_USER`              | Paired       | —       | Required if `SMTP_PASS` set                                         |
| `SMTP_PASS`              | Paired       | —       | Required if `SMTP_USER` set                                         |
| `MAIL_FROM`              | When enabled | —       | Sender address (`"BOMY <noreply@brandsofmalaysia.com>"`)            |
| `MAIL_REPLY_TO`          | No           | —       | Reply-To header                                                     |
| `OPS_ALERT_EMAILS`       | No           | —       | Comma-separated ops addresses; empty → `email_notification_skipped` |
| `APP_URL`                | When enabled | —       | Web app base URL (buyer/seller links)                               |
| `ADMIN_URL`              | When enabled | —       | Admin app base URL (ops alert links)                                |

---

## 7. Testing Plan

| Location                                                      | What to test                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/tests/lib/mailer.test.ts`                           | `createMailer` disabled mode (skipped log, no SMTP call); `parseOpsEmails` (empty, commas, whitespace, unset); `joinUrl` (trailing slash, leading slash)                                                                                           |
| `apps/api/tests/notifications/order.test.ts`                  | `dispatchOrderNotifications`: happy path per descriptor type; per-send failure isolation (one send throws, others complete); missing `OPS_ALERT_EMAILS` → skipped log; batch query fires once for multi-store `order_paid`; no body/content logged |
| `apps/api/tests/notifications/membership.test.ts`             | `sendRenewalEmail`: happy path; disabled mailer → skipped log                                                                                                                                                                                      |
| `apps/api/tests/webhooks/hitpay/order-fanout.test.ts`         | `handleOrderPayment` returns `OrderPaymentResult` with correct descriptor shapes; voucher-fail path: `order_paid` + `voucher_claim_failed`, no `order_review`; idempotent replay returns `notifications: []`                                       |
| `apps/api/tests/webhooks/hitpay/park-review.test.ts`          | `emitNotification: false` suppresses descriptor; default (no opt) pushes `order_review`                                                                                                                                                            |
| `apps/api/tests/webhooks/hitpay/failure-release.test.ts`      | Descriptor pushed only when UPDATE transitions (not on no-op)                                                                                                                                                                                      |
| `apps/api/tests/routes/webhooks/hitpay.test.ts`               | **Fire-and-forget contract:** route returns 200 before `sendMail` resolves; `sendMail` is eventually called; route response does not await SMTP                                                                                                    |
| `apps/api/tests/jobs/membership-renewal-notification.test.ts` | **Failure isolation:** one-row `sendRenewalEmail` throws → job logs `email_notification_failed` and continues remaining rows; claim UPDATE already committed before send attempt                                                                   |

### No-body-logging test

`dispatchOrderNotifications` must log only metadata (`type`, `sessionId`) on `email_notification_failed` — never the email body. Assert that the `sendMail` mock receives a `text` field but the log spy does not capture it.

### Webhook fire-and-forget test

Inject a `sendMail` mock that returns a promise that resolves after a tick. Assert:

1. The route handler resolves (returns HTTP 200) before the `sendMail` promise settles.
2. After the tick resolves, `sendMail` has been called.

### Membership failure isolation

Seed two renewal-due users. Mock `sendRenewalEmail` to throw for the first user. Assert:

1. The job does not throw.
2. `email_notification_failed` is logged.
3. The second user's `sendRenewalEmail` is still called.
4. The membership record for the first user is already in the DB (claim committed before send attempt).

---

## 8. Deferred / Out of Scope

- HTML email templates — plain text only in PR #34.
- HitPay Transfers API for automated payouts — Stage 6+ (KYB-gated).
- Buyer "order shipped" notification — no `shipped` event from seller action yet; deferred.
- Unsubscribe / preference center — out of scope for Stage 5.
- Email open/click tracking — no third-party SDK in PR #34.
