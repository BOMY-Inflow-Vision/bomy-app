# PR #35 — `@bomy/mailer` Package + Remaining Notification Stubs

**Status:** Design locked (with Bob R1 scope change — see addendum below)
**Date:** 2026-05-25
**Author model:** Opus 4.7
**Supersedes:** Prior draft at the same path (replaced after a fresh five-section brainstorm with Charlie).

---

## Addendum — Bob R1 review (2026-05-27)

Bob flagged the public `submitSellerInquiry` server action as an arbitrary-recipient mailer vector: the public form has no auth/captcha/rate limit, and the submitted email was passed straight into Nodemailer's `to:` field — comma- or semicolon-separated input could fan out to attacker-chosen recipients. Charlie's call: **drop the applicant ack from PR #35 entirely** (ops-only path), plus add server-side single-address shape validation before insert. Specifically:

- `submitSellerInquiry` validates email shape (regex rejects whitespace, `,`, `;`, `<`, `>`, `"`, and multiple `@`) — invalid input rejects with `Please provide a valid email address.` before the DB insert.
- `sendApplicantAck` is removed from `apps/web/src/notifications/seller-inquiry.ts`; the action only dispatches the ops alert (to `OPS_ALERT_EMAILS`, server-controlled).
- When `OPS_ALERT_EMAILS` is empty, the action logs `email_notification_skipped { reason: "missing_ops_recipients" }` and returns — no outbound send.
- Tests updated so no public-submitted email is ever used as `to`.
- **Follow-up (out of PR #35 scope):** before public launch or paid traffic on `/seller/apply`, add Turnstile (or equivalent) abuse protection. Re-introducing the applicant ack is gated on that protection landing.

Bob's other two findings — payout email currency rendering (F2: now uses `RM` for MYR, `USD` for non-MYR; non-MYR test added) and the spec/env mismatch (F3: §3 table updated below to admin-only-needs-transport+APP_URL) — are also applied in this PR.

Sections 4.1, 4.4 below describe the original applicant-ack design intent — left intact for design-history context. The shipped behavior is the addendum above.

---

## 1. Goal

Extract the transport-neutral mailer into a shared `@bomy/mailer` package, then use it to wire the three remaining notification flows from the Stage 5 spec that are unwired today:

| Surface      | Trigger                                                | Recipients                       |
| ------------ | ------------------------------------------------------ | -------------------------------- |
| `apps/web`   | `submitSellerInquiry` server action commits            | applicant + ops alert            |
| `apps/api`   | `issueMonthlyVouchers` BullMQ job inserts new vouchers | each newly-issued voucher's user |
| `apps/admin` | `createPayoutRecord` server action happy path          | store-owner seller               |

Only one of the three (seller-inquiry) is a literal `console.log` stub today; the other two are unwired entirely. PR #35 ships the dispatch logic for all three and the shared package that makes web/admin able to send mail at all.

---

## 2. Architecture

### 2.1 New workspace package `packages/mailer/` (`@bomy/mailer`)

```
packages/mailer/
├── package.json              # @bomy/mailer; deps: nodemailer; scripts: lint, typecheck, test
├── tsconfig.json             # mirrors packages/hitpay/tsconfig.json
├── src/
│   ├── index.ts              # public re-exports
│   ├── mailer.ts             # createMailer factory (moved from apps/api/src/lib/mailer.ts)
│   ├── env.ts                # configFromEnv(env): MailerConfig
│   └── helpers.ts            # parseOpsEmails(env), joinUrl(base, path)
└── tests/
    ├── mailer.test.ts        # moved from apps/api/tests/lib/mailer.test.ts (3 tests)
    ├── env.test.ts           # new: validation rules
    └── helpers.test.ts       # moved from apps/api/tests/notifications/order.test.ts (parseOpsEmails + joinUrl tests)
```

**`packages/mailer/src/index.ts` exports:**

```ts
export { createMailer } from "./mailer.js"
export type { Mailer, MailerConfig } from "./mailer.js"
export { configFromEnv } from "./env.js"
export { parseOpsEmails, joinUrl } from "./helpers.js"
```

**`packages/mailer/tsconfig.json`** mirrors `packages/hitpay/tsconfig.json`:

- `extends: "../../tsconfig.base.json"`
- `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- `verbatimModuleSyntax: false`
- `noEmit: true`
- `include: ["src/**/*", "tests/**/*"]`

**`packages/mailer/package.json`** mirrors `packages/hitpay/package.json`'s scripts exactly:

```json
"scripts": {
  "lint": "eslint src tests --max-warnings 0",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

`nodemailer` (and `@types/nodemailer`) move from `apps/api/package.json` to `packages/mailer/package.json`.

### 2.2 `configFromEnv(env): MailerConfig`

Single source of truth for env parsing and validation. Replaces the inline parsing in `apps/api/src/plugins/mailer.ts:12–28`.

**Scope:** mail-transport vars only.

| Var                      | Required when | Default          | Validation                                   |
| ------------------------ | ------------- | ---------------- | -------------------------------------------- |
| `EMAIL_DELIVERY_ENABLED` | —             | unset → disabled | `"true"` ⇒ enabled; anything else ⇒ disabled |
| `SMTP_HOST`              | enabled       | —                | non-empty                                    |
| `SMTP_PORT`              | —             | `587`            | parses as int                                |
| `SMTP_SECURE`            | —             | `false`          | `"true"` ⇒ secure                            |
| `SMTP_USER`              | —             | —                | both-or-neither with `SMTP_PASS`             |
| `SMTP_PASS`              | —             | —                | both-or-neither with `SMTP_USER`             |
| `MAIL_FROM`              | enabled       | —                | non-empty                                    |
| `MAIL_REPLY_TO`          | —             | —                | passes through if set                        |

**Behavior:**

- `EMAIL_DELIVERY_ENABLED !== "true"` → returns a valid `MailerConfig` with `enabled: false`. **No throws regardless of other vars being missing.** Strict validation only fires when enabled.
- `EMAIL_DELIVERY_ENABLED === "true"` with any required var missing/malformed → throws (same error messages as the current plugin code).

**Out of `configFromEnv` scope** (notification env contract, but consumed by dispatchers/helpers, not the factory):

- `OPS_ALERT_EMAILS` → parsed by `parseOpsEmails(env)` at dispatch time.
- `APP_URL`, `ADMIN_URL` → passed into template functions via `joinUrl(base, path)`.

### 2.3 `apps/api` changes (minimal-churn migration)

- `apps/api/src/lib/mailer.ts` → becomes a compatibility shim so existing relative imports stay green:

  ```ts
  export {
    createMailer,
    configFromEnv,
    parseOpsEmails,
    joinUrl,
    type Mailer,
    type MailerConfig,
  } from "@bomy/mailer"
  ```

- `apps/api/src/plugins/mailer.ts` → uses `configFromEnv(process.env)` + `createMailer(config, log)` from `@bomy/mailer` directly. **Fail-fast at registration on enabled-misconfig stays unchanged.**
- `apps/api/src/notifications/order.ts` → local `parseOpsEmails`/`joinUrl` definitions removed; imports come via the shim (no relative-path churn in this file) or `@bomy/mailer` (either is fine).
- `apps/api/src/notifications/membership.ts` → `Mailer` type imported via shim.
- `apps/api/src/jobs/voucher-issuance.ts` → signature change (see §4.2).
- `apps/api/src/scheduler.ts` → extend `deps` with `appLog: JobLogger`; voucher worker callback calls `issueMonthlyVouchers(db, deps.mailer, deps.appLog)`. `apps/api/src/server.ts` passes `appLog: app.log` (Fastify's pino satisfies `JobLogger`).
- `apps/api/package.json` → swaps `nodemailer` + `@types/nodemailer` for `"@bomy/mailer": "workspace:*"`.

### 2.4 Lazy singleton wrappers for the Next.js apps

**`apps/web/src/lib/mailer.ts`:**

```ts
import { configFromEnv, createMailer, type Mailer } from "@bomy/mailer"

let _mailer: Mailer | null = null

export function getMailer(): Mailer {
  if (_mailer) return _mailer
  try {
    const config = configFromEnv(process.env)
    _mailer = createMailer(config, { info: (obj, msg) => console.log(msg, obj) })
  } catch (err) {
    console.error({
      event: "mailer_config_invalid",
      message: err instanceof Error ? err.message : String(err),
    })
    _mailer = createMailer(
      { enabled: false, host: "", port: 0, secure: false, from: "" },
      { info: (obj, msg) => console.log(msg, obj) },
    )
  }
  return _mailer
}

/** Test-only: clear the cached singleton between tests. */
export function resetMailerForTests(): void {
  _mailer = null
}
```

`apps/admin/src/lib/mailer.ts` — identical structure.

**Why try/catch and not the api's fail-fast?** A Next.js server action calling `getMailer()` must not 500 the user's primary action because SMTP env is wrong. The lazy-singleton fallback collapses misconfig and `EMAIL_DELIVERY_ENABLED=false` into the same disabled-mode behavior: log `email_notification_skipped` per send, return normally. Fixing env requires a process restart because the cached no-op is intentional.

**Test isolation:** singleton tests call `resetMailerForTests()` in `beforeEach` (or use `vi.resetModules()`) so the cached instance doesn't bleed between cases.

---

## 3. Env contract and `.env.example` updates

All four env example files in the repo need updates so that any app's bootstrap procedure documents the full notification env block. `infra/docker/.env.example` stays infra-only (Mailhog ports only; no app runtime SMTP vars).

| File                            | Currently has                                                   | Add                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example` (root master)    | `MAILHOG_*`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `APP_URL` | `EMAIL_DELIVERY_ENABLED`, `MAIL_FROM`, `MAIL_REPLY_TO`, `OPS_ALERT_EMAILS`, `ADMIN_URL`                                                                                             |
| `apps/api/.env.local.example`   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`                         | `EMAIL_DELIVERY_ENABLED`, `MAIL_FROM`, `MAIL_REPLY_TO`, `OPS_ALERT_EMAILS`, `APP_URL`, `ADMIN_URL`                                                                                  |
| `apps/web/.env.local.example`   | `APP_URL`                                                       | `EMAIL_DELIVERY_ENABLED`, `SMTP_*`, `MAIL_FROM`, `MAIL_REPLY_TO`, `OPS_ALERT_EMAILS`, `ADMIN_URL`                                                                                   |
| `apps/admin/.env.local.example` | (none of these)                                                 | transport block + `APP_URL` only: `EMAIL_DELIVERY_ENABLED`, `SMTP_*`, `MAIL_FROM`, `MAIL_REPLY_TO`, `APP_URL` (no `OPS_ALERT_EMAILS` / `ADMIN_URL` — admin code does not read them) |

Mailhog defaults stay as-is (`SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`).

---

## 4. Notification flows

### 4.1 Seller inquiry — `apps/web` (server action, **awaited** sends)

**File:** `apps/web/src/app/seller/apply/actions.ts`

**Changes:**

1. Change the existing insert to capture the new row id:
   ```ts
   const [inserted] = await db
     .insert(schema.sellerInquiries)
     .values({ name, email, contactNumber, companyName, storeName, message })
     .returning({ id: schema.sellerInquiries.id })
   const inquiryId = inserted!.id
   ```
2. Replace line 29's `console.log` stub with awaited sends.
3. Send the applicant ack first, then the ops alert. **Both sends are independent** — if the applicant send fails, ops is still attempted; if ops fails, the action returns normally.
4. If `OPS_ALERT_EMAILS` is empty, log `email_notification_skipped` with `reason: "missing_ops_recipients"` and still send the applicant ack.

**New file:** `apps/web/src/notifications/seller-inquiry.ts`

Exports two template functions:

```ts
export function sendApplicantAck(
  mailer: Mailer,
  inquiry: { name: string; email: string; storeName: string },
): Promise<void>

export function sendOpsAlert(
  mailer: Mailer,
  inquiry: {
    inquiryId: string
    name: string
    email: string
    contactNumber: string
    companyName: string
    storeName: string
    message: string | null
  },
  env: { adminUrl: string; opsEmails: string[] },
): Promise<void>
```

**Applicant ack template:**

- To: the submitted email (not a user-account lookup; applicant may not have an account)
- Subject: `"We received your BOMY seller application"`
- Body: `"Hi {name},\n\nWe've received your application for {storeName}. Our team will review it and contact you soon.\n\nBOMY Team"`
- **No SLA promise** in copy.

**Ops alert template:**

- To: `opsEmails` array
- Subject: `"[BOMY Ops] New seller inquiry — {storeName}"`
- Body: lists `name`, `email`, `contactNumber`, `companyName`, `storeName`, `message`, and a link via `joinUrl(adminUrl, "/seller-inquiries")`

**Action wrapper (sketch):**

```ts
const mailer = getMailer()
try {
  await sendApplicantAck(mailer, { name, email, storeName })
} catch (err) {
  console.error({
    event: "email_notification_failed",
    recipientType: "applicant",
    inquiryId,
    message: err instanceof Error ? err.message : String(err),
  })
}
const opsEmails = parseOpsEmails(process.env)
if (opsEmails.length === 0) {
  console.info({ event: "email_notification_skipped", reason: "missing_ops_recipients", inquiryId })
} else {
  try {
    await sendOpsAlert(
      mailer,
      { inquiryId, name, email, contactNumber, companyName, storeName, message },
      { adminUrl: process.env["ADMIN_URL"] ?? "", opsEmails },
    )
  } catch (err) {
    console.error({
      event: "email_notification_failed",
      recipientType: "ops",
      inquiryId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
```

### 4.2 Voucher issuance — `apps/api` (BullMQ worker, **awaited** sends + summary log)

**File:** `apps/api/src/jobs/voucher-issuance.ts`

**Signature change:**

```ts
export interface JobLogger {
  info(obj: object, msg: string): void
  warn(obj: object, msg: string): void
  error(obj: object, msg: string): void
}

export async function issueMonthlyVouchers(
  db: Database,
  mailer: Mailer,
  log: JobLogger,
): Promise<number>
```

`JobLogger` is the pino-shape (`(obj, msg)`) that Fastify's `app.log` already satisfies. Return value (inserted count) is unchanged so the scheduler log and any callers keep working.

**Scheduler plumbing change** (`apps/api/src/scheduler.ts`): the existing `deps.logger` shape (`info(msg: string)` / `error(obj, msg)`) does not match `JobLogger`. Extend `deps` with an `appLog: JobLogger` field — `apps/api/src/server.ts` passes `app.log` directly. Other workers continue using `deps.logger` for their summary-string logs; only the voucher worker uses `deps.appLog`, which it forwards to `issueMonthlyVouchers`.

**Restructured flow:**

1. **Insert transaction** (existing `withAdmin` block) — extend `.returning(...)` so the row data needed for the email is captured:

   ```ts
   .returning({
     id: schema.vouchers.id,
     userId: schema.vouchers.userId,
     code: schema.vouchers.code,
     type: schema.vouchers.type,
     fixedAmountSen: schema.vouchers.fixedAmountSen,
     percentage: schema.vouchers.percentage,
     randomResolvedSen: schema.vouchers.randomResolvedSen,
     expiresAt: schema.vouchers.expiresAt,
   })
   ```

   Vouchers skipped by `ON CONFLICT DO NOTHING` (existing rows for the same `(userId, issuedMonth)`) are **not** returned, so **only newly-issued vouchers get emailed**.

2. **Commit** — the insert tx returns.

3. **Hydrate emails — second `withAdmin` read tx:**

   ```ts
   const emailRows = await withAdmin(
     db,
     { userId: SYSTEM_ACTOR, reason: "voucher-issuance: hydrate emails for issued vouchers" },
     async (tx) =>
       tx
         .select({ id: schema.users.id, email: schema.users.email })
         .from(schema.users)
         .where(inArray(schema.users.id, insertedUserIds)),
   )
   const emailByUserId = new Map(emailRows.map((r) => [r.id, r.email]))
   ```

   `vouchers.user_id` is `NOT NULL` with FK `onDelete: "restrict"`, and `users.email` is `NOT NULL`, so under normal operation every inserted row has a hydratable email. A defensive `user_email_not_found` skip path exists in the helper for unit-test purposes (see §6).

4. **Delegated send loop via `dispatchVoucherEmails` helper** — runs outside any transaction. The job calls the helper and awaits it (no request to protect; deterministic summary log preferred over fire-and-forget). Loop body, skip-log, failure isolation, and the summary log all live in the helper so they can be tested directly:

   ```ts
   await dispatchVoucherEmails(
     mailer,
     inserted,
     emailByUserId,
     { appUrl: process.env["APP_URL"] ?? "", issuedMonth },
     log,
   )
   // helper emits voucher_issuance_summary; counters are returned for callers/tests that want them
   return inserted.length
   ```

5. The existing `console.log("[voucher-issuance] No config found — skipping")` on the old line 120 stays as-is. The old line 156 count log is replaced by the helper's structured `voucher_issuance_summary`.

**New file:** `apps/api/src/notifications/voucher.ts`

```ts
export interface IssuedVoucher {
  id: string
  userId: string
  code: string
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedAmountSen: bigint | null
  percentage: number | null
  randomResolvedSen: bigint | null
  expiresAt: Date
}

export interface DispatchSummary {
  sent: number
  failed: number
  skipped: number
}

export function sendVoucherIssuedEmail(
  mailer: Mailer,
  voucher: IssuedVoucher,
  email: string,
  env: { appUrl: string },
): Promise<void>

export function dispatchVoucherEmails(
  mailer: Mailer,
  inserted: readonly IssuedVoucher[],
  emailByUserId: ReadonlyMap<string, string>,
  env: { appUrl: string; issuedMonth: string },
  log: JobLogger,
): Promise<DispatchSummary>
```

`dispatchVoucherEmails` owns:

- the per-row `try`/`catch` send loop,
- the `email_notification_skipped` log on missing-email (`user_email_not_found`),
- the `email_notification_failed` log on send throws,
- emitting one `voucher_issuance_summary` log with the counters at the end.

Returning `DispatchSummary` lets tests assert counters without parsing logs.

**Template:**

- Subject: `"Your BOMY monthly voucher — code {code}"`
- Body recapping (rendered per type):
  - `fixed_myr` → `"RM {senToMyrStr(fixedAmountSen)} off"`
  - `percentage` → `"{percentage}% off"`
  - `random_myr` → `"RM {senToMyrStr(randomResolvedSen)} off (your monthly random reward!)"`
- Voucher code shown inline in the body (`"Use code {code} at checkout."`).
- Expiry date rendered with `en-MY` locale (same pattern as membership renewal).
- CTA link: `joinUrl(env.appUrl, "/account")` — the `/account/vouchers` route does **not** exist today; switch when it ships (see §8).

**Scheduler change** (`apps/api/src/scheduler.ts:88`):

```ts
const n = await issueMonthlyVouchers(db, deps.mailer, deps.appLog)
```

**`senToMyrStr` helper:** for PR #35, replicate the one-liner already present at `apps/api/src/notifications/order.ts:19`. Later consolidation into `packages/mailer/src/format.ts` or `apps/*/src/lib/money.ts` is out of scope (see §8).

### 4.3 Payout created — `apps/admin` (server action, **awaited** send)

**File:** `apps/admin/src/app/payouts/actions.ts`

**Trigger:** `createPayoutRecord` happy path only. **No email** on `ALREADY_EXISTS`, `NOT_PAYABLE`, `NOT_FOUND`, or any state transition (`markPayoutProcessing` / `markPayoutCompleted` / `markPayoutFailed`).

**Changes inside `createPayoutRecord` (after the existing `withAdmin` returns `{ ok: true, payoutId }`):**

1. **Hydrate notification context — separate `withAdmin` read** (does **not** extend the existing locking SELECT; keeps the lock query lean and avoids pulling email columns into the row-lock path):

   ```ts
   const owner = alias(schema.users, "owner")
   const [ctx] = await withAdmin(
     getDb(),
     { userId: adminId, reason: "payout: hydrate notification context" },
     async (tx) =>
       tx
         .select({
           orderId: schema.orders.id,
           sellerEmail: owner.email,
           amountSen: schema.orderPayouts.amountSen,
           currency: schema.orderPayouts.currency,
         })
         .from(schema.orderPayouts)
         .innerJoin(schema.orders, eq(schema.orderPayouts.orderId, schema.orders.id))
         .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
         .innerJoin(owner, eq(schema.stores.ownerId, owner.id))
         .where(eq(schema.orderPayouts.id, result.payoutId))
         .limit(1),
   )
   ```

   The alias is declared once before the query and used in both the `select` and the `innerJoin` so both reference the same alias object.

2. **Awaited send with per-send try/catch.** Email failure must not change the action result:
   ```ts
   if (ctx) {
     const mailer = getMailer()
     try {
       await sendPayoutPendingEmail(mailer, ctx, { appUrl: process.env["APP_URL"] ?? "" })
     } catch (err) {
       console.error({
         event: "email_notification_failed",
         payoutId: result.payoutId,
         sellerEmail: ctx.sellerEmail,
         message: err instanceof Error ? err.message : String(err),
       })
     }
   }
   revalidatePath("/payouts")
   ```

**New file:** `apps/admin/src/notifications/payout.ts`

```ts
export function sendPayoutPendingEmail(
  mailer: Mailer,
  ctx: { orderId: string; sellerEmail: string; amountSen: bigint; currency: string },
  env: { appUrl: string },
): Promise<void>
```

**Template:**

- Short order id: `ctx.orderId.slice(0, 8)`.
- Subject: `"Payout of RM {senToMyrStr(amountSen)} for order {shortOrderId} is pending"` (no `#` prefix; no human order number exists yet).
- Body: amount + currency + `"Status: pending. Funds will be transferred manually."` (no SLA promise — product hasn't owned a turnaround number).
- Dashboard link: ``joinUrl(env.appUrl, `/seller/dashboard/orders/${ctx.orderId}`)`` — full UUID in the URL path.
- **`bomyCommissionSen` absent from body** (consistent with PR #34 invariant).

---

## 5. Error handling, logging, and PII rules

### 5.1 Error matrix

| Failure                                                    | Behavior                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configFromEnv` throws during api boot                     | Server fails to start (unchanged from today)                                                                                                         |
| `configFromEnv` throws inside web/admin `getMailer()`      | Logged as `mailer_config_invalid` with `message` only; cached disabled no-op returned; subsequent calls return same cached no-op                     |
| `mailer.sendMail` throws in web seller-apply (applicant)   | `email_notification_failed` log with `{ event, recipientType: "applicant", inquiryId, message }`; ops alert still attempted; action returns normally |
| `mailer.sendMail` throws in web seller-apply (ops)         | `email_notification_failed` log with `recipientType: "ops"`; action returns normally                                                                 |
| `mailer.sendMail` throws in admin payout-create            | `email_notification_failed` log with `{ payoutId, sellerEmail, message }`; action returns `{ ok: true, payoutId }` unchanged                         |
| `mailer.sendMail` throws in voucher job (per row)          | `email_notification_failed` log per row; `failed` counter incremented; loop continues; job returns inserted count                                    |
| `OPS_ALERT_EMAILS` empty (seller-inquiry)                  | `email_notification_skipped` log with `reason: "missing_ops_recipients"`; applicant ack still attempted                                              |
| User email missing during voucher hydrate (defensive only) | `email_notification_skipped` with `reason: "user_email_not_found"`; `skipped` counter incremented; continue                                          |
| Voucher worker dies mid-send-loop                          | **Known gap** — see §8                                                                                                                               |

### 5.2 PII rules (consistent with PR #34)

- **Email bodies and submitted message content are never logged.**
- Recipient addresses may appear in delivery metadata (disabled-mode `email_notification_skipped`) and failure diagnostics (`email_notification_failed`). This matches PR #34's existing behavior; no new exposure.
- Logged fields per event are listed in the table above and are exhaustive.

---

## 6. Test plan

### 6.1 `packages/mailer/tests/`

| File                                                                        | Tests                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mailer.test.ts` (moved from `apps/api/tests/lib/mailer.test.ts`)           | Disabled-mode resolves; logs only `subject` + `to`; close() resolves. 3 tests, behavior unchanged.                                                                                                                                                                             |
| `env.test.ts` (new)                                                         | `configFromEnv` enabled-mode validation: throws on missing `SMTP_HOST`, missing `MAIL_FROM`, NaN `SMTP_PORT`, mismatched `SMTP_USER`/`SMTP_PASS`. `configFromEnv` **disabled-mode**: no throw when `EMAIL_DELIVERY_ENABLED !== "true"` regardless of other vars being missing. |
| `helpers.test.ts` (moved from `apps/api/tests/notifications/order.test.ts`) | `parseOpsEmails` (3 cases: empty, whitespace, mixed), `joinUrl` (2 cases: trailing/leading slash variants).                                                                                                                                                                    |

### 6.2 `apps/api/tests/`

| File                                  | Action | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/lib/mailer.test.ts`            | Delete | Moved to `packages/mailer/tests/mailer.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/notifications/order.test.ts`   | Modify | Remove the `parseOpsEmails` and `joinUrl` cases (moved); dispatcher tests stay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/jobs/voucher-issuance.test.ts` | Add    | Hydrate + dispatch happy path (asserts `dispatchVoucherEmails` is called with the inserted rows and the hydrated email map; job returns inserted count); insert tx commits independently of dispatch outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/notifications/voucher.test.ts` | Create | (a) `sendVoucherIssuedEmail` content per type (`fixed_myr` renders RM amount; `percentage` renders %; `random_myr` renders resolved amount); subject contains code; body contains `joinUrl(APP_URL, "/account")` and inline code. (b) `dispatchVoucherEmails`: happy path returns `{ sent: N, failed: 0, skipped: 0 }`; per-row failure isolation (first send throws → `failed: 1`, second sent → `sent: 1`); **defensive `user_email_not_found`** test (one inserted row has no entry in `emailByUserId` → `skipped: 1`, `email_notification_skipped` logged with `reason: "user_email_not_found"`); summary log emitted once at the end with the right counters |

### 6.3 `apps/web/tests/`

| File                                         | Action | Tests                                                                                                                                                                                                   |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/lib/mailer.test.ts`                   | Create | Singleton happy path; misconfig fallback (`mailer_config_invalid` logged, disabled no-op returned, second call returns same cached instance). Uses `resetMailerForTests()` in `beforeEach`.             |
| `tests/notifications/seller-inquiry.test.ts` | Create | Applicant ack template (subject, recap, no SLA promise); ops alert template (all submitted fields present, admin link via `joinUrl`)                                                                    |
| `tests/seller-inquiries/actions.test.ts`     | Create | Server action: insert returns id; both sends attempted; OPS_ALERT_EMAILS empty → applicant still sent + skipped log; one send failing doesn't block the other; action returns normally on email failure |

### 6.4 `apps/admin/tests/`

| File                                 | Action                 | Tests                                                                                                                                                                                        |
| ------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/lib/mailer.test.ts`           | Create                 | Same shape as web (singleton + misconfig fallback + cache; `resetMailerForTests` reset)                                                                                                      |
| `tests/notifications/payout.test.ts` | Create                 | Template: amount rendering via `senToMyrStr`; short order id (8 chars) in subject; full UUID in dashboard link; no `bomyCommissionSen` in body                                               |
| `tests/payouts/actions.test.ts`      | Extend (existing file) | `createPayoutRecord` happy path triggers email with hydrated context; `ALREADY_EXISTS`/`NOT_PAYABLE`/`NOT_FOUND` do not trigger email; email failure doesn't change `{ ok: true, payoutId }` |

### 6.5 Manual smoke (PR description)

Listed in the PR description body. Restated in `app/log/2026-05-XX_PR35_*.md` after merge.

1. Run Mailhog locally (`docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d`) with `EMAIL_DELIVERY_ENABLED=true SMTP_HOST=localhost SMTP_PORT=1025 SMTP_SECURE=false MAIL_FROM="BOMY <noreply@brandsofmalaysia.com>"` plus per-app `APP_URL`/`ADMIN_URL`/`OPS_ALERT_EMAILS`.
2. Submit a seller inquiry through `apps/web` → Mailhog UI (http://localhost:8025) shows two messages: applicant ack + ops alert.
3. Trigger voucher issuance via `POST /internal/jobs/voucher-issuance` with `INTERNAL_API_SECRET` → Mailhog shows one message per active member; structured log shows `voucher_issuance_summary` with non-zero `sent`.
4. Click "Create Payout" on a completed order in `apps/admin` → Mailhog shows one seller-payout-pending message; action returns normally.

---

## 7. File map

### New files

| Path                                                  |
| ----------------------------------------------------- |
| `packages/mailer/package.json`                        |
| `packages/mailer/tsconfig.json`                       |
| `packages/mailer/src/index.ts`                        |
| `packages/mailer/src/mailer.ts`                       |
| `packages/mailer/src/env.ts`                          |
| `packages/mailer/src/helpers.ts`                      |
| `packages/mailer/tests/mailer.test.ts`                |
| `packages/mailer/tests/env.test.ts`                   |
| `packages/mailer/tests/helpers.test.ts`               |
| `apps/web/src/lib/mailer.ts`                          |
| `apps/web/src/notifications/seller-inquiry.ts`        |
| `apps/web/tests/lib/mailer.test.ts`                   |
| `apps/web/tests/notifications/seller-inquiry.test.ts` |
| `apps/web/tests/seller-inquiries/actions.test.ts`     |
| `apps/admin/src/lib/mailer.ts`                        |
| `apps/admin/src/notifications/payout.ts`              |
| `apps/admin/tests/lib/mailer.test.ts`                 |
| `apps/admin/tests/notifications/payout.test.ts`       |
| `apps/api/src/notifications/voucher.ts`               |
| `apps/api/tests/notifications/voucher.test.ts`        |

### Modified files

| Path                                           | Change                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/lib/mailer.ts`                   | Becomes compatibility shim: `export { ... } from "@bomy/mailer"`                                                                                             |
| `apps/api/src/plugins/mailer.ts`               | Uses `configFromEnv` + `createMailer` from `@bomy/mailer`; behavior unchanged                                                                                |
| `apps/api/src/notifications/order.ts`          | Removes local `parseOpsEmails`/`joinUrl`; imports them from `@bomy/mailer` (via shim)                                                                        |
| `apps/api/src/notifications/membership.ts`     | `Mailer` type imported via shim                                                                                                                              |
| `apps/api/src/jobs/voucher-issuance.ts`        | Add `mailer` and `log: JobLogger` params; restructure for `.returning(...)` + hydrate; delegate send loop to `dispatchVoucherEmails`; return value unchanged |
| `apps/api/src/scheduler.ts`                    | Extend `deps` with `appLog: JobLogger`; voucher worker calls `issueMonthlyVouchers(db, deps.mailer, deps.appLog)`                                            |
| `apps/api/src/server.ts`                       | Pass `appLog: app.log` into `createScheduler` deps (Fastify's pino satisfies `JobLogger`)                                                                    |
| `apps/api/tests/jobs/voucher-issuance.test.ts` | Add hydrate + send tests; per-row failure isolation                                                                                                          |
| `apps/api/tests/notifications/order.test.ts`   | Remove `parseOpsEmails`/`joinUrl` tests (moved to `packages/mailer`); dispatcher tests stay                                                                  |
| `apps/api/package.json`                        | Swap `nodemailer` + `@types/nodemailer` for `"@bomy/mailer": "workspace:*"`                                                                                  |
| `apps/web/src/app/seller/apply/actions.ts`     | Replace stub; `.returning({ id })`; awaited applicant ack + ops alert with per-recipient try/catch                                                           |
| `apps/web/package.json`                        | Add `"@bomy/mailer": "workspace:*"`                                                                                                                          |
| `apps/admin/src/app/payouts/actions.ts`        | Add hydrate + awaited send at end of `createPayoutRecord` happy path; alias declared once                                                                    |
| `apps/admin/tests/payouts/actions.test.ts`     | Extend with the payout-email cases above                                                                                                                     |
| `apps/admin/package.json`                      | Add `"@bomy/mailer": "workspace:*"`                                                                                                                          |
| `pnpm-lock.yaml`                               | Regenerated by `pnpm install`                                                                                                                                |
| `.env.example`                                 | Add notification env block (see §3)                                                                                                                          |
| `apps/api/.env.local.example`                  | Add notification env block (see §3)                                                                                                                          |
| `apps/web/.env.local.example`                  | Add notification env block (see §3)                                                                                                                          |
| `apps/admin/.env.local.example`                | Add notification env block (see §3)                                                                                                                          |

### Deleted files

| Path                                | Reason                                          |
| ----------------------------------- | ----------------------------------------------- |
| `apps/api/tests/lib/mailer.test.ts` | Moved to `packages/mailer/tests/mailer.test.ts` |

### Verified — no change expected

- `pnpm-workspace.yaml` — already covers `apps/*` and `packages/*`.

---

## 8. Out of scope (called out so reviewers don't expect them)

- **`checkout_enabled` flip runbook doc** — separate small docs PR (PR #36 or standalone). It's operational rollout work, not notification wiring; bundling dilutes the review surface.
- **`notification_outbox` / durable email queue** — would close the voucher-worker mid-loop crash gap (§9). Out of PR #35 scope; future PR if delivery durability becomes a product requirement.
- **i18n / locale templates** — EN only for PR #35 (matches PR #34). The Stage 0 EN→BM→ZH roadmap is independent.
- **`/account/vouchers` storefront route** — does not exist today. Voucher email links to `/account` and includes the voucher code inline. Switch the link when the route ships.
- **`senToMyrStr` consolidation** — the one-liner is replicated across `apps/api/src/notifications/{order,voucher}.ts` and `apps/admin/src/notifications/payout.ts` for PR #35. Later helper extraction (into `packages/mailer/src/format.ts` or `apps/*/src/lib/money.ts`) is left for when it grows.
- **Internal HTTP `POST /internal/notifications/send` endpoint or BullMQ producer in web/admin** — rejected at the architecture step. Shared package was chosen over both alternatives.

## 9. Known gaps

- **Voucher worker mid-send-loop crash:** if the worker dies after the insert tx commits but before all sends in the loop complete, a BullMQ retry finds the unique constraint satisfied and inserts zero new vouchers. The vouchers are issued; the unsent emails are permanently lost (no retry signal). This is consistent with the no-outbox scope. Future fix is a `notification_outbox` table or an email-send queue, not PR #35.

---

## 10. Decision log (compact)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                       | Source                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 1   | Shared `@bomy/mailer` workspace package (not internal HTTP, not BullMQ)                                                                                                                                                                                                                                                                                                        | Brainstorm Q1                      |
| 2   | Voucher: awaited send loop in worker + deterministic summary log (not fire-and-forget)                                                                                                                                                                                                                                                                                         | Brainstorm Q2                      |
| 3   | Seller-inquiry: two recipients (applicant + ops); applicant ack still sent if ops emails missing                                                                                                                                                                                                                                                                               | Brainstorm Q3                      |
| 4   | Payout: trigger only on createPayoutRecord happy path; no email on errors or other transitions                                                                                                                                                                                                                                                                                 | Brainstorm Q4                      |
| 5   | Scope = three wirings + env example updates + apps/api dispatcher migration; checkout_enabled runbook deferred                                                                                                                                                                                                                                                                 | Brainstorm Q5                      |
| 6   | Lazy-singleton try/catch fallback in web/admin (no `validateWhenEnabled` flag)                                                                                                                                                                                                                                                                                                 | Section 2 review                   |
| 7   | `configFromEnv` scoped to mail-transport vars only; OPS_ALERT_EMAILS/APP_URL/ADMIN_URL stay with dispatchers                                                                                                                                                                                                                                                                   | Section 2 review                   |
| 8   | Voucher hydrate happens in a separate `withAdmin` read tx (not inside the insert tx)                                                                                                                                                                                                                                                                                           | Section 3 review                   |
| 9   | Voucher link → `/account` (route `/account/vouchers` doesn't exist); voucher code shown inline                                                                                                                                                                                                                                                                                 | Section 3 review                   |
| 10  | Payout copy = no SLA promise; short order id = first 8 chars; full UUID in link path                                                                                                                                                                                                                                                                                           | Section 3 review                   |
| 11  | `apps/api/src/lib/mailer.ts` kept as a thin re-export shim to minimize churn                                                                                                                                                                                                                                                                                                   | Section 1 review                   |
| 12  | `parseOpsEmails` and `joinUrl` (and their tests) move into `@bomy/mailer`                                                                                                                                                                                                                                                                                                      | Section 1 review                   |
| 13  | `resetMailerForTests()` test-only helper for singleton isolation                                                                                                                                                                                                                                                                                                               | Section 4 review                   |
| 14  | PII rule wording: "bodies and submitted message content never logged; recipient addresses may appear in metadata/failure diagnostics"                                                                                                                                                                                                                                          | Section 4 review                   |
| 15  | `user_email_not_found` is unreachable under FK + NOT NULL constraints → demoted to defensive unit test                                                                                                                                                                                                                                                                         | Section 4 review (schema verified) |
| 16  | Voucher job takes an explicit `log: JobLogger` param; `apps/api/src/scheduler.ts` extends `deps` with `appLog`; `apps/api/src/server.ts` passes `app.log`. Send loop extracted into `dispatchVoucherEmails(mailer, inserted, emailByUserId, env, log)` in `apps/api/src/notifications/voucher.ts` so the defensive `user_email_not_found` test has a real surface to exercise. | Spec review (Bob-style findings)   |
