# PR #34 Notifications & Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real transactional email to four existing HitPay webhook events and replace the membership renewal stub log.

**Architecture:** `handleOrderPayment` returns an `OrderPaymentResult` value carrying `NotificationDescriptor[]`. After the webhook DB transaction commits, the route fires `dispatchOrderNotifications` without awaiting it. The HTTP response to HitPay never waits on SMTP. A provider-neutral nodemailer transport sends email; `EMAIL_DELIVERY_ENABLED=false` (default) makes it a no-op log.

**Tech Stack:** nodemailer (SMTP), Fastify plugin pattern (fp), Drizzle ORM alias joins, vitest with real Postgres.

---

## Codebase reference

All commands run from `app/` (monorepo root). API tests:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/api test --run
```

Key files you will touch:

| File                                                   | Current role                                            |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `apps/api/src/webhooks/hitpay/order-fanout.ts`         | `handleOrderPayment` returns `"handled" \| "not_order"` |
| `apps/api/src/webhooks/hitpay/park-review.ts`          | `parkPaymentReview` signature without notifications     |
| `apps/api/src/webhooks/hitpay/failure-release.ts`      | `runFailureRelease` without notifications               |
| `apps/api/src/routes/webhooks/hitpay.ts`               | Route calls `handleOrderPayment`; no fire-and-forget    |
| `apps/api/src/scheduler.ts`                            | `createScheduler(db, logger)` — no mailer param         |
| `apps/api/src/jobs/membership-renewal-notification.ts` | Uses `console.log` stub                                 |
| `apps/api/src/server.ts`                               | Registers plugins and hitpay routes                     |

`park-review.ts` currently owns and exports `PaymentReviewReason`. That type moves to `notifications/types.ts` in Task 2.

`stores.ownerId` FK references `users.id` — the seller's email is `users.email WHERE users.id = stores.owner_id`.

---

## Task 1: Mailer foundation

**Files:**

- Create: `apps/api/src/lib/mailer.ts`
- Create: `apps/api/src/plugins/mailer.ts`
- Create: `apps/api/tests/lib/mailer.test.ts`
- Modify: `apps/api/package.json`
- Update: `pnpm-lock.yaml` (via pnpm add)

- [ ] **Step 1: Install nodemailer**

From `app/`:

```sh
pnpm --filter @bomy/api add nodemailer
pnpm --filter @bomy/api add -D @types/nodemailer
```

Expected: `apps/api/package.json` gains `"nodemailer"` in dependencies and `"@types/nodemailer"` in devDependencies. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write failing tests for `createMailer`**

Create `apps/api/tests/lib/mailer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { createMailer } from "../../src/lib/mailer.js"

const BASE_CONFIG = {
  enabled: false,
  host: "localhost",
  port: 587,
  secure: false,
  from: "test@bomy.my",
}

describe("createMailer — disabled mode", () => {
  it("resolves without error and does not throw", async () => {
    const mailer = createMailer(BASE_CONFIG, { info: vi.fn() })
    await expect(
      mailer.sendMail({ to: "a@b.com", subject: "Hi", text: "Body" }),
    ).resolves.toBeUndefined()
  })

  it("logs email_notification_skipped with to and subject but not text", async () => {
    const log = vi.fn()
    const mailer = createMailer(BASE_CONFIG, { info: log })
    await mailer.sendMail({ to: "a@b.com", subject: "Hi", text: "SECRET" })
    expect(log).toHaveBeenCalledOnce()
    const [obj, msg] = log.mock.calls[0]!
    expect(msg).toBe("email_notification_skipped")
    expect((obj as Record<string, unknown>)["to"]).toBe("a@b.com")
    expect((obj as Record<string, unknown>)["subject"]).toBe("Hi")
    expect(JSON.stringify(obj)).not.toContain("SECRET")
  })

  it("close() resolves without error", async () => {
    const mailer = createMailer(BASE_CONFIG, { info: vi.fn() })
    await expect(mailer.close()).resolves.toBeUndefined()
  })
})

describe("parseOpsEmails", () => {
  it("splits comma-separated addresses, trims whitespace, drops empty", async () => {
    const { parseOpsEmails } = await import("../../src/notifications/order.js")
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "ops@bomy.my, finance@bomy.my , " })).toEqual([
      "ops@bomy.my",
      "finance@bomy.my",
    ])
  })

  it("returns empty array when OPS_ALERT_EMAILS is unset", async () => {
    const { parseOpsEmails } = await import("../../src/notifications/order.js")
    expect(parseOpsEmails({})).toEqual([])
  })
})

describe("joinUrl", () => {
  it("strips trailing slash from base and joins", async () => {
    const { joinUrl } = await import("../../src/notifications/order.js")
    expect(joinUrl("https://app.bomy.my/", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })

  it("handles base without trailing slash", async () => {
    const { joinUrl } = await import("../../src/notifications/order.js")
    expect(joinUrl("https://app.bomy.my", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```sh
pnpm --filter @bomy/api test mailer.test.ts --run
```

Expected: FAIL — `../../src/lib/mailer.js` not found.

- [ ] **Step 4: Create `apps/api/src/lib/mailer.ts`**

```ts
import nodemailer from "nodemailer"

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
): Mailer {
  if (!config.enabled) {
    return {
      async sendMail(opts) {
        log.info({ to: opts.to, subject: opts.subject }, "email_notification_skipped")
      },
      async close() {},
    }
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  })

  return {
    async sendMail(opts) {
      await transport.sendMail({
        from: config.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      })
    },
    async close() {
      transport.close()
    },
  }
}
```

- [ ] **Step 5: Create `apps/api/src/plugins/mailer.ts`**

```ts
import fp from "fastify-plugin"

import { createMailer, type Mailer } from "../lib/mailer.js"

declare module "fastify" {
  interface FastifyInstance {
    mailer: Mailer
  }
}

export const mailerPlugin = fp(async (app) => {
  const enabled = process.env["EMAIL_DELIVERY_ENABLED"] === "true"
  const host = process.env["SMTP_HOST"] ?? ""
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10)
  const secure = process.env["SMTP_SECURE"] === "true"
  const user = process.env["SMTP_USER"]
  const pass = process.env["SMTP_PASS"]
  const from = process.env["MAIL_FROM"] ?? ""
  const replyTo = process.env["MAIL_REPLY_TO"]

  if (enabled) {
    if (!host) throw new Error("SMTP_HOST is required when EMAIL_DELIVERY_ENABLED=true")
    if (!from) throw new Error("MAIL_FROM is required when EMAIL_DELIVERY_ENABLED=true")
    if (Boolean(user) !== Boolean(pass)) {
      throw new Error("SMTP_USER and SMTP_PASS must both be set or both absent")
    }
  }

  const mailer = createMailer(
    { enabled, host, port, secure, user, pass, from, replyTo },
    { info: (obj, msg) => app.log.info(obj, msg) },
  )

  app.decorate("mailer", mailer)
  app.addHook("onClose", async () => {
    await mailer.close()
  })
})
```

- [ ] **Step 6: Run tests — expect PASS**

```sh
pnpm --filter @bomy/api test mailer.test.ts --run
```

Expected: PASS (the `parseOpsEmails` and `joinUrl` tests will still fail because `notifications/order.ts` doesn't exist yet — that's OK, those tests will be addressed in Task 3).

Actually — move the `parseOpsEmails` and `joinUrl` describe blocks to `apps/api/tests/notifications/order.test.ts` (Task 3). Remove them from `mailer.test.ts` now to keep this file focused.

- [ ] **Step 7: Typecheck**

```sh
pnpm --filter @bomy/api typecheck
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```sh
git -C /path/to/app add apps/api/src/lib/mailer.ts apps/api/src/plugins/mailer.ts \
  apps/api/tests/lib/mailer.test.ts apps/api/package.json pnpm-lock.yaml
git -C /path/to/app commit -m "feat(api): mailer foundation — createMailer factory + Fastify plugin"
```

---

## Task 2: Notification types + return-value changes

**Files:**

- Create: `apps/api/src/notifications/types.ts`
- Modify: `apps/api/src/webhooks/hitpay/park-review.ts`
- Modify: `apps/api/src/webhooks/hitpay/order-fanout.ts`
- Modify: `apps/api/src/webhooks/hitpay/failure-release.ts`

**Context:** `park-review.ts` currently exports `PaymentReviewReason`. That type moves to `notifications/types.ts`. `parkPaymentReview` gains two new parameters: `notifications: NotificationDescriptor[]` and `opts?: { emitNotification?: boolean }`. `handleOrderPayment` return type changes from `"handled" | "not_order"` to `OrderPaymentResult`. `runFailureRelease` gains `notifications: NotificationDescriptor[]`.

- [ ] **Step 1: Write failing tests for park-review `emitNotification` suppression**

Open `apps/api/tests/webhooks/park-review.test.ts`. Add at the end of the outermost `describe` block (after all existing `it(...)` calls):

```ts
describe("parkPaymentReview — emitNotification opts", () => {
  it("pushes order_review descriptor by default", async () => {
    const { sessionId } = await seedSession()
    const session = await getSession(sessionId)
    const notifications: import("../../src/notifications/types.js").NotificationDescriptor[] = []

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test" }, async (tx) => {
      await parkPaymentReview(tx, session, "amount_mismatch", { paymentId: "" }, notifications)
    })

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      type: "order_review",
      reason: "amount_mismatch",
      sessionId,
    })
  })

  it("does NOT push descriptor when emitNotification: false", async () => {
    const { sessionId } = await seedSession()
    const session = await getSession(sessionId)
    const notifications: import("../../src/notifications/types.js").NotificationDescriptor[] = []

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test" }, async (tx) => {
      await parkPaymentReview(
        tx,
        session,
        "voucher_claim_failed",
        { paymentId: "" },
        notifications,
        { emitNotification: false },
      )
    })

    expect(notifications).toHaveLength(0)
  })
})
```

The helper functions `seedSession` and `getSession` are already defined in that test file. The import for `parkPaymentReview` is already at the top of the file.

- [ ] **Step 2: Write failing tests for `handleOrderPayment` return shape**

Open `apps/api/tests/webhooks/order-fanout.test.ts`. In the main `describe` block, find the happy-path test (`it("fan-out: happy path ...")`). Below it, add a new test:

```ts
it("handleOrderPayment result shape — handled with order_paid descriptor", async () => {
  const { sessionId } = await seedSession()
  const result = await handleOrderPayment(makeArgs(sessionId))

  expect(result.result).toBe("handled")
  if (result.result !== "handled") return
  expect(result.notifications.length).toBeGreaterThanOrEqual(1)
  const paid = result.notifications.find((d) => d.type === "order_paid")
  expect(paid).toBeDefined()
  expect(
    (paid as import("../../src/notifications/types.js").OrderPaidDescriptor).voucherClaimFailed,
  ).toBe(false)
})

it("handleOrderPayment result shape — not_order returns empty notifications", async () => {
  const result = await handleOrderPayment(makeArgs("no-such-payment-request-id"))
  expect(result.result).toBe("not_order")
  expect(result.notifications).toHaveLength(0)
})
```

Note: `makeArgs(paymentRequestId)` is a helper already in the test file; pass a UUID that matches a seeded session's `psp_payment_request_id`.

- [ ] **Step 3: Run tests — expect FAIL**

```sh
pnpm --filter @bomy/api test park-review.test.ts order-fanout.test.ts --run
```

Expected: FAIL — `notifications` param missing from `parkPaymentReview`, `handleOrderPayment` return type is a string.

- [ ] **Step 4: Create `apps/api/src/notifications/types.ts`**

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

- [ ] **Step 5: Update `apps/api/src/webhooks/hitpay/park-review.ts`**

Make these changes:

**a)** Replace the local type export at the top of the file:

```ts
// REMOVE this block (lines 26-30):
export type PaymentReviewReason =
  | "amount_mismatch"
  | "invalid_commission_config"
  | "voucher_claim_failed"
```

**b)** Add import after the existing imports:

```ts
import type {
  NotificationDescriptor,
  OrderReviewDescriptor,
  PaymentReviewReason,
} from "../notifications/types.js"
```

**c)** Update `parkPaymentReview` signature — add `notifications` and `opts` params after `args`:

```ts
export async function parkPaymentReview(
  tx: Database,
  session: CheckoutSessionRow,
  reason: PaymentReviewReason,
  args: Pick<OrderPaymentArgs, "paymentId">,
  notifications: NotificationDescriptor[],
  opts?: { emitNotification?: boolean },
): Promise<void> {
  await tx
    .update(schema.checkoutSessions)
    .set({
      status: "payment_review_required",
      paymentReviewReason: reason,
      ...(args.paymentId ? { pspPaymentId: args.paymentId } : {}),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.checkoutSessions.id, session.id),
        eq(schema.checkoutSessions.status, "pending_payment"),
      ),
    )

  if (opts?.emitNotification !== false) {
    notifications.push({
      type: "order_review",
      sessionId: session.id,
      reason: reason as OrderReviewDescriptor["reason"],
    })
  }
}
```

- [ ] **Step 6: Update `apps/api/src/webhooks/hitpay/failure-release.ts`**

**a)** Add import:

```ts
import type { NotificationDescriptor } from "../../notifications/types.js"
```

**b)** Update `runFailureRelease` signature — add `notifications` param:

```ts
export async function runFailureRelease(
  tx: Database,
  session: CheckoutSessionRow,
  args: Pick<OrderPaymentArgs, "app" | "paymentId" | "eventIdentity">,
  notifications: NotificationDescriptor[],
): Promise<void> {
```

**c)** After the `args.app.log.info(...)` call at the end of the function (the `order_payment_failed` log, currently the last statement), add:

```ts
notifications.push({
  type: "order_failed",
  sessionId: session.id,
  buyerId: session.userId,
})
```

- [ ] **Step 7: Update `apps/api/src/webhooks/hitpay/order-fanout.ts`**

This is the largest change. Make all changes in one edit:

**a)** Add imports after the existing imports block:

```ts
import type { NotificationDescriptor, OrderPaymentResult } from "../notifications/types.js"
```

**b)** Remove the import of `PaymentReviewReason` from `park-review.js` — it's no longer exported from there. The import line currently reads:

```ts
import { parkPaymentReview, runConsistencyCheck, warnOnEventCollision } from "./park-review.js"
```

That import stays — `PaymentReviewReason` was not imported there anyway (it was only used in park-review.ts itself). No change needed to the park-review import line.

**c)** Change `handleOrderPayment` return type and result variable:

```ts
export async function handleOrderPayment(args: OrderPaymentArgs): Promise<OrderPaymentResult> {
  const notifications: NotificationDescriptor[] = []
  let result: OrderPaymentResult = { result: "not_order", notifications: [] }

  await withAdmin(
    args.app.db.db,
    {
      userId: SYSTEM_ACTOR,
      reason: `hitpay webhook: order payment ${args.eventIdentity.pspEventId}`,
    },
    async (tx) => {
      // Step 0: dispatch lookup.
      const dispatchRows = await tx
        .select({ id: schema.checkoutSessions.id })
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.pspPaymentRequestId, args.paymentRequestId))
        .limit(1)
      if (dispatchRows.length === 0) {
        return // result stays { result: "not_order", notifications: [] }
      }

      // From here on we own the event.
      result = { result: "handled", notifications }
```

Note: by setting `result = { result: "handled", notifications }` (where `notifications` is the same array reference), all pushes to `notifications` after this point will be visible in `result.notifications` when the function returns.

**d)** Update the Step D call to `runFailureRelease` — add `notifications`:

```ts
if (args.status === "failed") {
  await runFailureRelease(tx, session, args, notifications)
  return
}
```

**e)** Update ALL direct calls to `parkPaymentReview` in `handleOrderPayment` — add `notifications` (no `opts`, so descriptor is pushed by default):

Line 146 region (Step E):

```ts
await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
```

Line 164 region (Step E2):

```ts
await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
```

Line 185 region (Step E3 — unparseable amount):

```ts
await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
```

Line 201 region (Step E3 — amount mismatch):

```ts
await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
```

**f)** Update the call to `fanOutPaid` — add `notifications`:

```ts
await fanOutPaid(tx, session, args, notifications)
```

**g)** Update `fanOutPaid` signature:

```ts
async function fanOutPaid(
  tx: Database,
  session: CheckoutSessionRow,
  args: OrderPaymentArgs,
  notifications: NotificationDescriptor[],
): Promise<void> {
```

**h)** Update ALL calls to `parkPaymentReview` inside `fanOutPaid` — add `notifications`:

Step 2 (psp fee unparseable):

```ts
await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
```

Step 2 (psp fee exceeds gross):

```ts
await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
```

Step 3 (invalid commission config):

```ts
await parkPaymentReview(tx, session, "invalid_commission_config", args, notifications)
```

Step 6 (negative seller payout):

```ts
await parkPaymentReview(tx, session, "invalid_commission_config", args, notifications)
```

**i)** In Step 9 (voucher-claim-failed branch), replace the inline UPDATE with a call to `parkPaymentReview` and push the `voucher_claim_failed` descriptor. Find this block (lines 603–618 in the original):

```ts
await tx
  .update(schema.checkoutSessions)
  .set({
    status: "payment_review_required",
    paymentReviewReason: "voucher_claim_failed",
    ...(args.paymentId ? { pspPaymentId: args.paymentId } : {}),
    updatedAt: sql`now()`,
  })
  .where(
    and(
      eq(schema.checkoutSessions.id, session.id),
      eq(schema.checkoutSessions.status, "pending_payment"),
    ),
  )
```

Replace with:

```ts
await parkPaymentReview(tx, session, "voucher_claim_failed", args, notifications, {
  emitNotification: false,
})
```

**j)** At Step 12 (the end of `fanOutPaid`, after the `args.app.log.info(...)` call), push the `order_paid` descriptor and conditionally the `voucher_claim_failed` descriptor. After the `args.app.log.info(...)` block at the very end of the function, add:

```ts
notifications.push({
  type: "order_paid",
  sessionId: session.id,
  buyerId: session.userId,
  orderIds: insertedOrders.map((o) => o.id),
  voucherClaimFailed,
})
if (voucherClaimFailed && session.voucherId) {
  notifications.push({
    type: "voucher_claim_failed",
    sessionId: session.id,
    voucherId: session.voucherId,
  })
}
```

- [ ] **Step 8: Run tests — expect PASS**

```sh
pnpm --filter @bomy/api test park-review.test.ts order-fanout.test.ts --run
```

Expected: PASS. If the existing tests in `order-fanout.test.ts` fail because `handleOrderPayment` now returns an object, update any assertion that was `expect(result).toBe("handled")` to `expect(result.result).toBe("handled")`.

- [ ] **Step 9: Typecheck**

```sh
pnpm --filter @bomy/api typecheck
```

Expected: 0 errors.

- [ ] **Step 10: Commit**

```sh
git -C /path/to/app add apps/api/src/notifications/types.ts \
  apps/api/src/webhooks/hitpay/park-review.ts \
  apps/api/src/webhooks/hitpay/order-fanout.ts \
  apps/api/src/webhooks/hitpay/failure-release.ts \
  apps/api/tests/webhooks/park-review.test.ts \
  apps/api/tests/webhooks/order-fanout.test.ts
git -C /path/to/app commit -m "feat(api): OrderPaymentResult return type + notification descriptors"
```

---

## Task 3: Dispatcher + webhook wiring

**Files:**

- Create: `apps/api/src/notifications/order.ts`
- Create: `apps/api/tests/notifications/order.test.ts`
- Modify: `apps/api/src/routes/webhooks/hitpay.ts`
- Modify: `apps/api/src/server.ts`

**Context:** `dispatchOrderNotifications` makes one batch SELECT (with two user aliases for buyer + seller emails) per `order_paid` descriptor. Per-send failure isolation: one failing `sendMail` catches its error, logs `email_notification_failed` (type + sessionId, NO body), and continues. The route must call `void dispatchOrderNotifications(...).catch(log)` AFTER `handleOrderPayment` returns — HitPay gets its 200 without waiting on SMTP. `mailerPlugin` must be registered before `hitpayWebhookRoutes` and before `createScheduler`.

- [ ] **Step 1: Write failing tests for the dispatcher helpers**

Create `apps/api/tests/notifications/order.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { joinUrl, parseOpsEmails } from "../../src/notifications/order.js"

describe("parseOpsEmails", () => {
  it("splits comma-separated addresses and trims whitespace", () => {
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "ops@bomy.my, finance@bomy.my , " })).toEqual([
      "ops@bomy.my",
      "finance@bomy.my",
    ])
  })

  it("returns empty array when OPS_ALERT_EMAILS is unset", () => {
    expect(parseOpsEmails({})).toEqual([])
  })

  it("returns empty array when OPS_ALERT_EMAILS is empty string", () => {
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "" })).toEqual([])
  })
})

describe("joinUrl", () => {
  it("strips trailing slash from base", () => {
    expect(joinUrl("https://app.bomy.my/", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })

  it("handles base without trailing slash", () => {
    expect(joinUrl("https://app.bomy.my", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })
})
```

- [ ] **Step 2: Run helper tests — expect FAIL**

```sh
pnpm --filter @bomy/api test order.test.ts --run
```

Expected: FAIL — `../../src/notifications/order.js` not found.

- [ ] **Step 3: Write the failing fire-and-forget test**

Open `apps/api/tests/webhooks/hitpay.test.ts`. In the main `describe.skipIf(!shouldRun)(...)` block, add at the end:

```ts
it("returns 200 without awaiting SMTP (fire-and-forget contract)", async () => {
  // Seed a valid pending_payment session so handleOrderPayment produces notifications.
  const sessionId = randomUUID()
  const buyerId = randomUUID()
  const storeId = randomUUID()
  const prId = randomUUID()

  // Minimal seed — just enough for handleOrderPayment to reach fan-out.
  // Reuse the seedSession helper pattern from beforeAll in this file.
  // (Use setupDb to insert test fixtures directly.)
  await withAdmin(
    setupDb.db,
    { userId: SYSTEM_ACTOR, reason: "fire-forget test seed" },
    async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" })
      const sellerId = randomUUID()
      await tx
        .insert(schema.users)
        .values({ id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" })
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Test Store",
        slug: `slug-${storeId}`,
        status: "active",
      })
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: "pending_payment",
        pspPaymentRequestId: prId,
        currency: "MYR",
        shippingAddress: {
          name: "T",
          phone: "+60123456789",
          line1: "1 Jln Test",
          city: "KL",
          postcode: "50000",
          state: "KL",
          country: "MY",
        },
        totalCatalogSen: 1000n,
        totalShippingSen: 0n,
        totalBuyerPaysSen: 1000n,
        totalDiscountSen: 0n,
      })
      await tx.insert(schema.checkoutSessionStores).values({
        checkoutSessionId: sessionId,
        storeId,
        retailSubtotalSen: 1000n,
        brandDiscountSen: 0n,
        discountedSubtotalSen: 1000n,
        shippingFeeSen: 0n,
        voucherContributionSen: 0n,
      })
    },
  )

  // Spy on sendMail — track calls without blocking.
  const sendMailSpy = vi.spyOn(app.mailer, "sendMail").mockResolvedValue(undefined)

  const payload = {
    payment_request_id: prId,
    payment_id: `pay-${randomUUID()}`,
    status: "completed",
    amount: "10.00",
    fees: "0.30",
  }
  const res = await webhookInject(app, payload, {
    "hitpay-event-type": "payment_request.completed",
  })

  // 200 must arrive regardless of SMTP state.
  expect(res.statusCode).toBe(200)

  // Give the event loop a tick for the fire-and-forget to schedule.
  await new Promise<void>((resolve) => setImmediate(resolve))
  // sendMail should have been called (disabled mailer or real mailer).
  // If EMAIL_DELIVERY_ENABLED is not set, the disabled mailer's sendMail
  // still gets called — it just logs instead of sending.
  expect(sendMailSpy).toHaveBeenCalled()

  // Cleanup
  sendMailSpy.mockRestore()
  await withAdmin(
    setupDb.db,
    { userId: SYSTEM_ACTOR, reason: "fire-forget test cleanup" },
    async (tx) => {
      await tx
        .delete(schema.checkoutSessionStores)
        .where(eq(schema.checkoutSessionStores.checkoutSessionId, sessionId))
      await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
    },
  )
})
```

You'll need `import { vi } from "vitest"` added to `hitpay.test.ts` imports if not already present.

- [ ] **Step 4: Run test — expect FAIL**

```sh
pnpm --filter @bomy/api test hitpay.test.ts --run
```

Expected: FAIL — `app.mailer` doesn't exist yet (mailerPlugin not registered).

- [ ] **Step 5: Create `apps/api/src/notifications/order.ts`**

```ts
import { schema } from "@bomy/db"
import { alias } from "drizzle-orm/pg-core"
import { eq, inArray } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

import type { NotificationDescriptor, OrderPaidDescriptor } from "./types.js"

export function parseOpsEmails(env: NodeJS.ProcessEnv): string[] {
  return (env["OPS_ALERT_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`)
}

function senToMyrStr(sen: bigint): string {
  const whole = sen / 100n
  const cents = sen % 100n
  return `${whole}.${cents.toString().padStart(2, "0")}`
}

async function send(
  app: FastifyInstance,
  opts: { to: string | string[]; subject: string; text: string },
  meta: { type: string; sessionId: string },
): Promise<void> {
  try {
    await app.mailer.sendMail(opts)
  } catch (err) {
    app.log.error({ err, type: meta.type, sessionId: meta.sessionId }, "email_notification_failed")
  }
}

async function dispatchOrderPaid(
  d: OrderPaidDescriptor,
  app: FastifyInstance,
  appUrl: string,
): Promise<void> {
  const buyerUser = alias(schema.users, "buyer_user")
  const sellerUser = alias(schema.users, "seller_user")

  const rows = await app.db.db
    .select({
      orderId: schema.orders.id,
      storeId: schema.orders.storeId,
      storeName: schema.stores.name,
      sellerPayoutSen: schema.orders.sellerPayoutSen,
      buyerEmail: buyerUser.email,
      sellerEmail: sellerUser.email,
    })
    .from(schema.orders)
    .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
    .innerJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
    .innerJoin(sellerUser, eq(schema.stores.ownerId, sellerUser.id))
    .where(inArray(schema.orders.id, d.orderIds))

  if (rows.length === 0) return

  const buyerEmail = rows[0]!.buyerEmail
  const ordersUrl = joinUrl(appUrl, "/account/orders")

  // Buyer email — one combined email listing all stores.
  const storeLines = rows
    .map((r) => `${r.storeName}: RM ${senToMyrStr(r.sellerPayoutSen)}`)
    .join("\n")
  const buyerBody = d.voucherClaimFailed
    ? `Your BOMY order is confirmed.\n\n${storeLines}\n\nNote: your voucher could not be applied and is under review. We'll contact you shortly.\n\nView your orders: ${ordersUrl}`
    : `Your BOMY order is confirmed.\n\n${storeLines}\n\nView your orders: ${ordersUrl}`

  await send(
    app,
    { to: buyerEmail, subject: "Your BOMY order is confirmed", text: buyerBody },
    { type: d.type, sessionId: d.sessionId },
  )

  // Seller emails — one per store.
  const sellersDone = new Set<string>()
  for (const row of rows) {
    if (sellersDone.has(row.storeId)) continue
    sellersDone.add(row.storeId)

    const sellerOrdersUrl = joinUrl(appUrl, "/seller/dashboard/orders")
    const sellerBody = `You have a new order on ${row.storeName}.\n\nPayout amount: RM ${senToMyrStr(row.sellerPayoutSen)}\n\nView your orders: ${sellerOrdersUrl}`

    await send(
      app,
      { to: row.sellerEmail, subject: "New order received on BOMY", text: sellerBody },
      { type: d.type, sessionId: d.sessionId },
    )
  }
}

export async function dispatchOrderNotifications(
  descriptors: NotificationDescriptor[],
  app: FastifyInstance,
): Promise<void> {
  const appUrl = process.env["APP_URL"] ?? ""
  const adminUrl = process.env["ADMIN_URL"] ?? ""
  const opsEmails = parseOpsEmails(process.env)

  for (const d of descriptors) {
    if (d.type === "order_paid") {
      await dispatchOrderPaid(d, app, appUrl)
      continue
    }

    if (d.type === "order_failed") {
      const userRows = await app.db.db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, d.buyerId))
        .limit(1)
      const buyerEmail = userRows[0]?.email
      if (buyerEmail) {
        const cartUrl = joinUrl(appUrl, "/cart")
        await send(
          app,
          {
            to: buyerEmail,
            subject: "Your BOMY payment could not be processed",
            text: `We were unable to process your payment. You can try again at ${cartUrl}.`,
          },
          { type: d.type, sessionId: d.sessionId },
        )
      }
      continue
    }

    if (d.type === "order_review") {
      if (opsEmails.length === 0) {
        app.log.info(
          { type: d.type, sessionId: d.sessionId, reason: "missing_ops_recipients" },
          "email_notification_skipped",
        )
        continue
      }
      const adminLink = joinUrl(adminUrl, `/checkout-sessions/${d.sessionId}`)
      await send(
        app,
        {
          to: opsEmails,
          subject: `[BOMY Ops] Payment review required — ${d.reason}`,
          text: `Session: ${d.sessionId}\nReason: ${d.reason}\nAdmin: ${adminLink}`,
        },
        { type: d.type, sessionId: d.sessionId },
      )
      continue
    }

    if (d.type === "voucher_claim_failed") {
      if (opsEmails.length === 0) {
        app.log.info(
          { type: d.type, sessionId: d.sessionId, reason: "missing_ops_recipients" },
          "email_notification_skipped",
        )
        continue
      }
      const adminLink = joinUrl(adminUrl, `/checkout-sessions/${d.sessionId}`)
      await send(
        app,
        {
          to: opsEmails,
          subject: `[BOMY Ops] Voucher claim failed for session ${d.sessionId}`,
          text: `Session: ${d.sessionId}\nVoucher: ${d.voucherId}\nAction required: reconcile voucher manually.\nAdmin: ${adminLink}`,
        },
        { type: d.type, sessionId: d.sessionId },
      )
    }
  }
}
```

- [ ] **Step 6: Update `apps/api/src/routes/webhooks/hitpay.ts`**

**a)** Add import at the top:

```ts
import { dispatchOrderNotifications } from "../../notifications/order.js"
```

**b)** Find the block that calls `handleOrderPayment` and uses its result (around lines 102–121). Replace:

```ts
const orderResult = await handleOrderPayment({
  app,
  paymentRequestId,
  paymentId,
  status,
  amountStr,
  feesStr,
  eventIdentity: identity,
})
trace.getActiveSpan()?.setAttribute("bomy.psp_event_id", identity.pspEventId)
if (orderResult === "not_order") {
  await handleBrandSubscriptionPayment({
    app,
    paymentRequestId,
    paymentId,
    status,
    amountStr,
    feesStr,
  })
}
```

With:

```ts
const orderResult = await handleOrderPayment({
  app,
  paymentRequestId,
  paymentId,
  status,
  amountStr,
  feesStr,
  eventIdentity: identity,
})
trace.getActiveSpan()?.setAttribute("bomy.psp_event_id", identity.pspEventId)

if (orderResult.result === "handled" && orderResult.notifications.length > 0) {
  void dispatchOrderNotifications(orderResult.notifications, app).catch((err: unknown) => {
    request.log.error({ err }, "email_notification_dispatch_error")
  })
}

if (orderResult.result === "not_order") {
  await handleBrandSubscriptionPayment({
    app,
    paymentRequestId,
    paymentId,
    status,
    amountStr,
    feesStr,
  })
}
```

- [ ] **Step 7: Update `apps/api/src/server.ts`**

**a)** Add import:

```ts
import { mailerPlugin } from "./plugins/mailer.js"
```

**b)** Register `mailerPlugin` before `hitpayWebhookRoutes`. Find the block:

```ts
await app.register(sessionPlugin)

await app.register(healthRoutes)
```

Change to:

```ts
await app.register(sessionPlugin)
await app.register(mailerPlugin)

await app.register(healthRoutes)
```

**c)** Update the `createScheduler` call to pass the mailer (the scheduler currently uses a `logger` param; the new signature uses `{ mailer, logger }` — but that's Task 4's job). For now, just confirm the mailerPlugin registration order is correct; the scheduler call change happens in Task 4.

- [ ] **Step 8: Run tests — expect PASS**

```sh
pnpm --filter @bomy/api test order.test.ts hitpay.test.ts --run
```

Expected: unit tests in `order.test.ts` pass; fire-and-forget test in `hitpay.test.ts` passes; existing `hitpay.test.ts` tests still pass.

- [ ] **Step 9: Typecheck**

```sh
pnpm --filter @bomy/api typecheck
```

Expected: 0 errors.

- [ ] **Step 10: Commit**

```sh
git -C /path/to/app add apps/api/src/notifications/order.ts \
  apps/api/src/routes/webhooks/hitpay.ts \
  apps/api/src/server.ts \
  apps/api/tests/notifications/order.test.ts \
  apps/api/tests/webhooks/hitpay.test.ts
git -C /path/to/app commit -m "feat(api): notification dispatcher + fire-and-forget webhook wiring"
```

---

## Task 4: Membership renewal conversion

**Files:**

- Create: `apps/api/src/notifications/membership.ts`
- Create: `apps/api/tests/notifications/membership.test.ts`
- Modify: `apps/api/src/jobs/membership-renewal-notification.ts`
- Modify: `apps/api/src/scheduler.ts`

**Context:** `sendRenewalEmail` is a thin wrapper around `mailer.sendMail`. The job currently does `console.log(...)` — replace with `sendRenewalEmail`. Failure isolation: one failing `sendRenewalEmail` logs `email_notification_failed` and continues the loop. The UPDATE claiming the row already committed before the send attempt, so do NOT let a send error abort the job. The scheduler's `createScheduler` signature changes from `(db, logger)` to `(db, { mailer, logger })`.

- [ ] **Step 1: Write failing tests for `sendRenewalEmail`**

Create `apps/api/tests/notifications/membership.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { sendRenewalEmail } from "../../src/notifications/membership.js"

describe("sendRenewalEmail", () => {
  it("calls mailer.sendMail with subject and periodEnd date", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined)
    const mailer = { sendMail, close: vi.fn() }

    const periodEnd = new Date("2027-01-15T00:00:00Z")
    await sendRenewalEmail(mailer, { email: "user@example.com", periodEnd, daysBefore: 7 })

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0]
    expect(call.to).toBe("user@example.com")
    expect(call.subject).toBe("Your BOMY membership renews in 7 days")
    expect(call.text).toContain("15") // date appears in body
    expect(call.text).not.toContain("amount") // no amount in body
  })

  it("propagates errors from mailer.sendMail", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("SMTP down"))
    const mailer = { sendMail, close: vi.fn() }

    await expect(
      sendRenewalEmail(mailer, { email: "u@e.com", periodEnd: new Date(), daysBefore: 30 }),
    ).rejects.toThrow("SMTP down")
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```sh
pnpm --filter @bomy/api test membership.test.ts --run
```

Expected: FAIL — `../../src/notifications/membership.js` not found.

- [ ] **Step 3: Create `apps/api/src/notifications/membership.ts`**

```ts
import type { Mailer } from "../lib/mailer.js"

export async function sendRenewalEmail(
  mailer: Mailer,
  opts: { email: string; periodEnd: Date; daysBefore: number },
): Promise<void> {
  const appUrl = (process.env["APP_URL"] ?? "").replace(/\/$/, "")
  const manageUrl = `${appUrl}/membership/manage`
  const dateStr = opts.periodEnd.toLocaleDateString("en-MY")

  await mailer.sendMail({
    to: opts.email,
    subject: `Your BOMY membership renews in ${opts.daysBefore} days`,
    text: `Your BOMY membership will renew on ${dateStr}.\n\nManage your membership at ${manageUrl}`,
  })
}
```

- [ ] **Step 4: Run test — expect PASS**

```sh
pnpm --filter @bomy/api test membership.test.ts --run
```

- [ ] **Step 5: Write failing test for membership renewal failure isolation**

Open `apps/api/tests/jobs/membership-renewal-notification.test.ts`. Add a new `describe` block at the end of the file (inside the outer `describe.skipIf`):

```ts
describe("notifyRenewalsDue — email send failure isolation", () => {
  it("continues remaining rows when one sendRenewalEmail throws", async () => {
    // Seed two members both in the T-7 window.
    const m1 = await seedMember(6 * 86400 * 1000)
    const m2 = await seedMember(6 * 86400 * 1000)

    // Mock mailer: first call throws, second resolves.
    let callCount = 0
    const mailer = {
      sendMail: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) throw new Error("SMTP timeout")
      }),
      close: vi.fn(),
    }

    // notifyRenewalsDue must NOT throw even though first send failed.
    const count = await notifyRenewalsDue(testDb.db, mailer)

    // Both rows were claimed (UPDATE committed) — count reflects claimed rows.
    expect(count).toBeGreaterThanOrEqual(2)

    // Both sends were attempted.
    expect(mailer.sendMail).toHaveBeenCalledTimes(2)

    // The notifiedDays for both members were updated — claim committed before send.
    const d1 = await getNotifiedDays(m1.subId)
    const d2 = await getNotifiedDays(m2.subId)
    expect(d1).toContain(7)
    expect(d2).toContain(7)

    await cleanup(m1.userId, m1.subId)
    await cleanup(m2.userId, m2.subId)
  })
})
```

You'll need `import { vi } from "vitest"` added to the imports at the top if not already present.

Also update the `notifyRenewalsDue` import to match the new signature — it will accept a `mailer` param in Step 6.

- [ ] **Step 6: Run test — expect FAIL**

```sh
pnpm --filter @bomy/api test membership-renewal-notification.test.ts --run
```

Expected: FAIL — `notifyRenewalsDue` doesn't accept a mailer param yet.

- [ ] **Step 7: Update `apps/api/src/jobs/membership-renewal-notification.ts`**

Full replacement (the file is small — easier to rewrite than patch):

```ts
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

import type { Mailer } from "../lib/mailer.js"
import { sendRenewalEmail } from "../notifications/membership.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const
const DEFAULT_NOTIFY_DAYS = [30, 14, 7, 1]

async function readNotifyDays(db: Database): Promise<number[]> {
  const rows = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read renewal notification days config" },
    async (tx) =>
      tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "renewal_notification_days")),
  )
  const raw = rows[0]?.value
  if (Array.isArray(raw) && raw.every((v) => typeof v === "number")) return raw
  return [...DEFAULT_NOTIFY_DAYS]
}

/**
 * Send renewal reminders for active memberships at each configured milestone.
 * UPDATE claiming the row commits before any email is sent. A send failure
 * logs email_notification_failed and continues — the claim is already durable.
 * Returns total number of emails attempted.
 */
export async function notifyRenewalsDue(db: Database, mailer: Mailer): Promise<number> {
  const notifyDays = await readNotifyDays(db)
  const sorted = [...notifyDays].sort((a, b) => b - a)

  let total = 0
  const now = Date.now()

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i]!
    const lowerDay = sorted[i + 1] ?? 0

    const upperCutoff = new Date(now + day * 24 * 60 * 60 * 1000)
    const lowerCutoff = new Date(now + lowerDay * 24 * 60 * 60 * 1000)

    // Atomically claim matching rows and fetch user emails in one transaction.
    const claimed = await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: `renewal notification T-${day}` },
      async (tx) => {
        const updated = await tx
          .update(schema.memberSubscriptions)
          .set({
            notifiedDays: sql`${schema.memberSubscriptions.notifiedDays} || ${JSON.stringify([day])}::jsonb`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.memberSubscriptions.status, "active"),
              lte(schema.memberSubscriptions.periodEnd, upperCutoff),
              gt(schema.memberSubscriptions.periodEnd, lowerCutoff),
              sql`NOT (${schema.memberSubscriptions.notifiedDays} @> ${JSON.stringify([day])}::jsonb)`,
            ),
          )
          .returning({
            id: schema.memberSubscriptions.id,
            userId: schema.memberSubscriptions.userId,
            periodEnd: schema.memberSubscriptions.periodEnd,
          })

        if (updated.length === 0) return []

        const userRows = await tx
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(
            inArray(
              schema.users.id,
              updated.map((r) => r.userId),
            ),
          )

        const emailById = new Map(userRows.map((r) => [r.id, r.email]))

        return updated.map((r) => ({
          userId: r.userId,
          periodEnd: r.periodEnd,
          email: emailById.get(r.userId) ?? null,
        }))
      },
    )

    for (const row of claimed) {
      if (!row.email) continue
      try {
        await sendRenewalEmail(mailer, {
          email: row.email,
          periodEnd: row.periodEnd,
          daysBefore: day,
        })
      } catch (err) {
        // Claim already committed — log failure and continue remaining rows.
        console.error(
          JSON.stringify({
            event: "email_notification_failed",
            userId: row.userId,
            daysBefore: day,
            err: String(err),
          }),
        )
      }
      total++
    }
  }

  return total
}
```

Note: `console.error` is used for the error log because this file doesn't have access to a Pino logger. The scheduler worker catches job-level errors separately. If you want structured logging, thread a logger param through — but keep it simple for now.

- [ ] **Step 8: Update `apps/api/src/scheduler.ts`**

**a)** Add import:

```ts
import type { Mailer } from "./lib/mailer.js"
```

**b)** Change `createScheduler` signature — replace the `logger` param with a `deps` object:

```ts
export async function createScheduler(
  db: Database,
  deps: {
    mailer: Mailer
    logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void }
  },
): Promise<Scheduler> {
```

**c)** Replace all uses of `logger` inside the function body with `deps.logger`, and update the renewal worker to pass `deps.mailer`:

The renewal worker body changes from:

```ts
const n = await notifyRenewalsDue(db)
logger.info(`jobs: membership-renewal-notification sent ${n} stubs`)
```

To:

```ts
const n = await notifyRenewalsDue(db, deps.mailer)
deps.logger.info(`jobs: membership-renewal-notification sent ${n} notifications`)
```

All other `logger.info(...)` and `logger.error(...)` calls become `deps.logger.info(...)` and `deps.logger.error(...)`.

**d)** Update the `createScheduler` call in `server.ts` (Task 3 Step 7c deferred to here):

In `server.ts`, find:

```ts
scheduler = await createScheduler(db, {
  info: (msg) => app.log.info(msg),
  error: (obj, msg) => app.log.error(obj, msg),
})
```

Change to:

```ts
scheduler = await createScheduler(app.db.db, {
  mailer: app.mailer,
  logger: {
    info: (msg) => app.log.info(msg),
    error: (obj, msg) => app.log.error(obj, msg),
  },
})
```

- [ ] **Step 9: Run tests — expect PASS**

```sh
pnpm --filter @bomy/api test membership.test.ts membership-renewal-notification.test.ts --run
```

Expected: PASS.

- [ ] **Step 10: Typecheck**

```sh
pnpm --filter @bomy/api typecheck
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```sh
git -C /path/to/app add apps/api/src/notifications/membership.ts \
  apps/api/src/jobs/membership-renewal-notification.ts \
  apps/api/src/scheduler.ts \
  apps/api/src/server.ts \
  apps/api/tests/notifications/membership.test.ts \
  apps/api/tests/jobs/membership-renewal-notification.test.ts
git -C /path/to/app commit -m "feat(api): membership renewal real email + per-row failure isolation"
```

---

## Task 5: Integration smoke + full suite

**Files:**

- Modify: `apps/api/tests/webhooks/failure-release.test.ts` (add descriptor assertion)
- Run full test suite

**Context:** Verify that all existing tests still pass, that `runFailureRelease` now pushes the `order_failed` descriptor on a real transition, and that the no-body-logging invariant holds.

- [ ] **Step 1: Add descriptor assertion to `failure-release.test.ts`**

Open `apps/api/tests/webhooks/failure-release.test.ts`. In the existing happy-path test (the one that asserts the session transitions to `failed`), add:

```ts
// Descriptor pushed on real transition.
const descriptors: import("../../src/notifications/types.js").NotificationDescriptor[] = []
await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test" }, async (tx) => {
  await runFailureRelease(tx, session, args, descriptors)
})
expect(descriptors).toHaveLength(1)
expect(descriptors[0]).toMatchObject({ type: "order_failed", sessionId: session.id })
```

And in the no-op test (session already terminal — `updated.length === 0` path), assert:

```ts
// No descriptor pushed on no-op.
const descriptors: import("../../src/notifications/types.js").NotificationDescriptor[] = []
await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test" }, async (tx) => {
  await runFailureRelease(tx, session, args, descriptors)
})
expect(descriptors).toHaveLength(0)
```

Note: If the existing tests call `runFailureRelease` directly, they'll need the new `notifications` param added. Pass an empty array `[]` for all existing tests that don't check descriptors.

- [ ] **Step 2: Run `failure-release.test.ts` — expect PASS**

```sh
pnpm --filter @bomy/api test failure-release.test.ts --run
```

- [ ] **Step 3: Add no-body-logging assertion to dispatcher test**

In `apps/api/tests/notifications/order.test.ts`, add an integration-level test at the end (requires a real DB and seeded order data):

```ts
// Skip if no DB — this test requires real data.
const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("dispatchOrderNotifications — no-body logging", () => {
  it("email_notification_failed log does not include the email body", async () => {
    const { makeDb, schema, withAdmin } = await import("@bomy/db")
    const { dispatchOrderNotifications } = await import("../../src/notifications/order.js")
    const { randomUUID } = await import("node:crypto")
    const { eq } = await import("drizzle-orm")

    const db = makeDb({ url: DATABASE_URL as string })
    const errorLogs: object[] = []
    const buyerId = randomUUID()
    const sellerId = randomUUID()
    const storeId = randomUUID()
    const orderId = randomUUID()
    const sessionId = randomUUID()
    const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

    await withAdmin(
      db.db,
      { userId: SYSTEM_ACTOR, reason: "no-body-log test seed" },
      async (tx) => {
        await tx
          .insert(schema.users)
          .values({ id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" })
        await tx
          .insert(schema.users)
          .values({ id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" })
        await tx.insert(schema.stores).values({
          id: storeId,
          ownerId: sellerId,
          name: "Test Store",
          slug: `slug-${storeId}`,
          status: "active",
        })
        await tx.insert(schema.checkoutSessions).values({
          id: sessionId,
          userId: buyerId,
          status: "paid",
          currency: "MYR",
          shippingAddress: {
            name: "T",
            phone: "+60123456789",
            line1: "1 Jln",
            city: "KL",
            postcode: "50000",
            state: "KL",
            country: "MY",
          },
          totalCatalogSen: 1000n,
          totalShippingSen: 0n,
          totalBuyerPaysSen: 1000n,
          totalDiscountSen: 0n,
        })
        await tx.insert(schema.orders).values({
          id: orderId,
          checkoutSessionId: sessionId,
          storeId,
          buyerId,
          currency: "MYR",
          shippingAddress: {
            name: "T",
            phone: "+60123456789",
            line1: "1 Jln",
            city: "KL",
            postcode: "50000",
            state: "KL",
            country: "MY",
          },
          shippingFeeSen: 0n,
          retailSubtotalSen: 1000n,
          brandDiscountSen: 0n,
          discountedSubtotalSen: 1000n,
          voucherContributionSen: 0n,
          pspFeeAllocatedSen: 30n,
          bomyCommissionSen: 243n,
          bomyCommissionPct: 25,
          sellerPayoutSen: 727n,
          paymentStatus: "paid",
          fulfilmentStatus: "processing",
        })
      },
    )

    // Mailer throws — triggers email_notification_failed log.
    const fakeApp = {
      db,
      mailer: { sendMail: vi.fn().mockRejectedValue(new Error("SMTP fail")), close: vi.fn() },
      log: {
        info: vi.fn(),
        error: (_obj: object, _msg: string) => {
          errorLogs.push(_obj)
        },
        warn: vi.fn(),
      },
    } as unknown as import("fastify").FastifyInstance

    await dispatchOrderNotifications(
      [{ type: "order_paid", sessionId, buyerId, orderIds: [orderId], voucherClaimFailed: false }],
      fakeApp,
    )

    // Verify error was logged.
    expect(errorLogs.length).toBeGreaterThan(0)
    // Verify body text is NOT in any log entry.
    for (const log of errorLogs) {
      const serialized = JSON.stringify(log)
      expect(serialized).not.toContain("confirmed") // body content
      expect(serialized).not.toContain("account/orders") // body URL
    }

    // Cleanup.
    await withAdmin(
      db.db,
      { userId: SYSTEM_ACTOR, reason: "no-body-log test cleanup" },
      async (tx) => {
        await tx.delete(schema.orders).where(eq(schema.orders.id, orderId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      },
    )

    await db.close()
  })
})
```

- [ ] **Step 4: Run full API test suite**

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/api test --run
```

Expected: ALL PASS. Note the existing test count plus any new tests.

- [ ] **Step 5: Typecheck + lint whole monorepo**

```sh
pnpm typecheck
pnpm lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```sh
git -C /path/to/app add apps/api/tests/webhooks/failure-release.test.ts \
  apps/api/tests/notifications/order.test.ts
git -C /path/to/app commit -m "test(api): failure-release descriptor + no-body-logging + full suite green"
```

---

## Environment variables required for manual smoke test

To manually test real email delivery with Mailhog:

```sh
EMAIL_DELIVERY_ENABLED=true \
SMTP_HOST=localhost \
SMTP_PORT=1025 \
SMTP_SECURE=false \
MAIL_FROM="BOMY <noreply@bomy.my>" \
APP_URL=http://localhost:3000 \
ADMIN_URL=http://localhost:3002 \
OPS_ALERT_EMAILS=ops@bomy.my \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
REDIS_URL=redis://:changeme_local@localhost:6379 \
HITPAY_SALT=any_local_salt \
pnpm --filter @bomy/api dev
```

View sent mail at http://localhost:8025.
