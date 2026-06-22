# Double-Charge Refund & Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durably record every detected duplicate subscription charge, book it to a liability account, surface it on the admin reconciliation page, and let an authorised admin issue a one-click HitPay refund that clears the liability — never touching revenue, payout, or entitlement.

**Architecture:** A new `duplicate_charges` table is the source of truth. The HitPay webhook (apps/api) records a row + a `liability:duplicate_charge_payable` ledger **credit** at both existing detection sites. An admin server action (apps/admin) compare-and-swaps the row to `refund_pending` then calls `HitPayClient.createRefund`. HitPay's resulting `charge.updated` refund webhook, now duplicate-aware, writes the **debit** that nets the liability to zero and marks the row `refunded`.

**Tech Stack:** Drizzle ORM + Postgres 16 (RLS), Fastify 5 (apps/api webhook), Next.js 15 server actions (apps/admin), `@bomy/hitpay` client, Vitest (integration tests against real Postgres).

## Global Constraints

- Money is **bigint minor units** (sen); never floats. Convert to `"N.NN"` string for HitPay via `senToMyr`.
- Every DB write goes through `withTenant` / `withAdmin` / `withPublicRead`. Detection + refund both use `withAdmin` (SYSTEM_ACTOR for webhook; admin id for the action).
- `SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"` — define per file, not imported.
- Migrations are **hand-written SQL** (drizzle-kit generate fails in this shell) and registered in `packages/db/scripts/migrate.mjs`. Each `--> statement-breakpoint` statement runs in its own implicit transaction.
- New ledger account string: `liability:duplicate_charge_payable`. New `revenue_source` value: `duplicate_charge`.
- Refund action gated to `["bomy_admin", "bomy_finance"]` (the existing `PAYOUT_ROLES`).
- Full-amount refunds only; a duplicate is always the entire sub price.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Test env for DB-backed suites: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1`.
- Spec: `docs/superpowers/specs/2026-06-23-duplicate-charge-reconciliation-design.md`.

---

## File map

- `packages/db/src/types.ts` — add `DUPLICATE_CHARGE_STATUSES`; add `duplicate_charge` to `REVENUE_SOURCES`.
- `packages/db/src/schema/enums.ts` — add `duplicateChargeStatusEnum`.
- `packages/db/src/schema/duplicate_charges.ts` (new) — table definition.
- `packages/db/src/schema/index.ts` — export the new table.
- `packages/db/drizzle/0016_duplicate_charge_reconciliation.sql` (new) — migration.
- `packages/db/scripts/migrate.mjs` — register 0016.
- `packages/db/src/rls/policies.sql` — append the four policies (canonical doc).
- `packages/db/tests/duplicate_charges.test.ts` (new) — DB foundation test.
- `apps/api/src/routes/webhooks/hitpay.ts` — detection helper + both sites + duplicate-aware `handleRefund`.
- `apps/api/tests/webhooks/hitpay.test.ts` — detection + refund tests.
- `apps/admin/src/app/payouts/reconciliation/actions.ts` (new) — `refundDuplicateCharge`.
- `apps/admin/src/app/payouts/reconciliation/page.tsx` — new "Duplicate charges" section.
- `apps/admin/src/app/payouts/reconciliation/_refund-button.tsx` (new) — client button.
- `apps/admin/tests/reconciliation/refund-action.test.ts` (new) — action test.

---

## Task 1: DB foundation — table, enums, migration, grants, RLS

**Files:**

- Modify: `packages/db/src/types.ts`
- Modify: `packages/db/src/schema/enums.ts`
- Create: `packages/db/src/schema/duplicate_charges.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/drizzle/0016_duplicate_charge_reconciliation.sql`
- Modify: `packages/db/scripts/migrate.mjs`
- Modify: `packages/db/src/rls/policies.sql`
- Test: `packages/db/tests/duplicate_charges.test.ts`

**Interfaces:**

- Produces: `schema.duplicateCharges` table with columns `{ id, subscriptionType, subscriptionId, userId, hitpayPaymentId, amountSen (bigint), currency, status, hitpayRefundId, resolvedBy, detectedAt, resolvedAt }`; enum `duplicateChargeStatusEnum` over `'detected' | 'refund_pending' | 'refunded'`; `REVENUE_SOURCES` includes `'duplicate_charge'`.

- [ ] **Step 1: Add the status list + revenue source to types.ts**

In `packages/db/src/types.ts`, add `'duplicate_charge'` to the `REVENUE_SOURCES` array (after `'processing_fee'`), and add below the `REVENUE_SOURCES` block:

```ts
export const DUPLICATE_CHARGE_STATUSES = ["detected", "refund_pending", "refunded"] as const
export type DuplicateChargeStatus = (typeof DUPLICATE_CHARGE_STATUSES)[number]
```

- [ ] **Step 2: Add the pg enum in enums.ts**

In `packages/db/src/schema/enums.ts`, add `DUPLICATE_CHARGE_STATUSES` to the import from `"../types.js"`, then add:

```ts
export const duplicateChargeStatusEnum = pgEnum(
  "duplicate_charge_status",
  DUPLICATE_CHARGE_STATUSES,
)
```

- [ ] **Step 3: Create the table schema**

Create `packages/db/src/schema/duplicate_charges.ts`:

```ts
import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { currencyEnum, duplicateChargeStatusEnum } from "./enums.js"

/**
 * One row per duplicate subscription charge — a payment received for an
 * entitlement we will not honour (abandoned-checkout re-pay, or a HitPay
 * recurring charge on an already-active membership). The HitPay webhook
 * inserts on detection; an admin issues a refund; the refund webhook clears it.
 *
 * `subscription_id` is polymorphic (member_subscriptions OR brand_subscriptions),
 * so it carries no FK. `user_id` is a denormalised snapshot (no FK) so the record
 * survives user deletion. `hitpay_payment_id` is unique — the idempotency anchor.
 */
export const duplicateCharges = pgTable(
  "duplicate_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionType: text("subscription_type").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    userId: uuid("user_id").notNull(),
    hitpayPaymentId: text("hitpay_payment_id").notNull(),
    amountSen: bigint("amount_sen", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    status: duplicateChargeStatusEnum("status").notNull().default("detected"),
    hitpayRefundId: text("hitpay_refund_id"),
    resolvedBy: uuid("resolved_by"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    paymentUnique: uniqueIndex("duplicate_charges_hitpay_payment_id_unique_idx").on(
      t.hitpayPaymentId,
    ),
    refundUnique: uniqueIndex("duplicate_charges_hitpay_refund_id_unique_idx")
      .on(t.hitpayRefundId)
      .where(sql`${t.hitpayRefundId} IS NOT NULL`),
    statusIdx: index("duplicate_charges_status_idx").on(t.status),
    amountPositive: check("duplicate_charges_amount_positive_chk", sql`${t.amountSen} > 0`),
    subTypeChk: check(
      "duplicate_charges_subscription_type_chk",
      sql`${t.subscriptionType} IN ('member_subscription','brand_subscription')`,
    ),
  }),
)
```

- [ ] **Step 4: Export the table**

In `packages/db/src/schema/index.ts`, add (keep alphabetical-ish ordering near the other `d`/`e` exports):

```ts
export * from "./duplicate_charges.js"
```

- [ ] **Step 5: Write the migration SQL**

Create `packages/db/drizzle/0016_duplicate_charge_reconciliation.sql`:

```sql
-- Migration 0016: duplicate_charges + reconciliation ledger source.
-- Records duplicate subscription charges (abandoned-checkout re-pay; recurring
-- charge on an already-active membership) for admin-reviewed refund. Self-contained:
-- enum value, status type, table, constraints, indexes, RLS, grants. Mirrors the
-- 0008_admin_bypass_audit pattern. Each statement is idempotent. src/rls/policies.sql
-- documents these policies but is not applied at runtime.

ALTER TYPE "revenue_source" ADD VALUE IF NOT EXISTS 'duplicate_charge';
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "duplicate_charge_status" AS ENUM ('detected', 'refund_pending', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "duplicate_charges" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_type" text NOT NULL,
  "subscription_id"   uuid NOT NULL,
  "user_id"           uuid NOT NULL,
  "hitpay_payment_id" text NOT NULL,
  "amount_sen"        bigint NOT NULL,
  "currency"          "currency_code" NOT NULL,
  "status"            "duplicate_charge_status" NOT NULL DEFAULT 'detected',
  "hitpay_refund_id"  text,
  "resolved_by"       uuid,
  "detected_at"       timestamptz NOT NULL DEFAULT now(),
  "resolved_at"       timestamptz,
  CONSTRAINT "duplicate_charges_amount_positive_chk" CHECK ("amount_sen" > 0),
  CONSTRAINT "duplicate_charges_subscription_type_chk"
    CHECK ("subscription_type" IN ('member_subscription', 'brand_subscription'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "duplicate_charges_hitpay_payment_id_unique_idx"
  ON "duplicate_charges" USING btree ("hitpay_payment_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "duplicate_charges_hitpay_refund_id_unique_idx"
  ON "duplicate_charges" USING btree ("hitpay_refund_id")
  WHERE "hitpay_refund_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "duplicate_charges_status_idx"
  ON "duplicate_charges" USING btree ("status");
--> statement-breakpoint

ALTER TABLE "duplicate_charges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "duplicate_charges" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_default_deny ON duplicate_charges
    AS RESTRICTIVE
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_staff_read ON duplicate_charges
    FOR SELECT
    USING (app.is_bomy_staff() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_bypass_insert ON duplicate_charges
    FOR INSERT
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY duplicate_charges_bypass_update ON duplicate_charges
    FOR UPDATE
    USING (app.is_admin_bypass())
    WITH CHECK (app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "duplicate_charges" TO bomy_app';
  END IF;
END
$$;
```

- [ ] **Step 6: Register the migration**

In `packages/db/scripts/migrate.mjs`, append to the `MIGRATIONS` array after the `0015_user_addresses` entry:

```js
  {
    name: "0016_duplicate_charge_reconciliation",
    file: join(__dirname, "../drizzle/0016_duplicate_charge_reconciliation.sql"),
  },
```

- [ ] **Step 7: Document policies in policies.sql**

Append a `duplicate_charges` section to `packages/db/src/rls/policies.sql`, mirroring the `admin_bypass_audit` section: the `ALTER TABLE duplicate_charges ENABLE ROW LEVEL SECURITY;` + `ALTER TABLE duplicate_charges FORCE ROW LEVEL SECURITY;` lines **and** the four `CREATE POLICY` blocks (default_deny, staff_read, bypass_insert, bypass_update). This file is the canonical documentation source (not applied at runtime), so it must reflect the full RLS state of the table, not just the policies.

- [ ] **Step 8: Apply the migration**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db migrate`
Expected: `apply 0016_duplicate_charge_reconciliation ... done` then `Migrations complete.`

- [ ] **Step 9: Write the DB foundation test**

Create `packages/db/tests/duplicate_charges.test.ts`. This proves table + grants + enum + RLS bypass insert/read all work end-to-end. Model the harness on `packages/db/tests/admin-bypass-audit.test.ts` (same dir).

```ts
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("duplicate_charges table", () => {
  let db: ReturnType<typeof makeDb>

  beforeAll(() => {
    db = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await db.close()
  })

  it("inserts and reads a row under withAdmin; unique on hitpay_payment_id", async () => {
    const paymentId = `pay_${randomUUID()}`
    const id = await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "test" }, async (tx) => {
      const [row] = await tx
        .insert(schema.duplicateCharges)
        .values({
          subscriptionType: "brand_subscription",
          subscriptionId: randomUUID(),
          userId: randomUUID(),
          hitpayPaymentId: paymentId,
          amountSen: 50000n,
          currency: "MYR",
        })
        .returning({ id: schema.duplicateCharges.id })
      return row!.id
    })

    const rows = await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "read" }, async (tx) =>
      tx.select().from(schema.duplicateCharges).where(eq(schema.duplicateCharges.id, id)),
    )
    expect(rows[0]?.status).toBe("detected")
    expect(rows[0]?.amountSen).toBe(50000n)

    // Duplicate payment id → unique violation (idempotency anchor).
    await expect(
      withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "dup" }, async (tx) => {
        await tx.insert(schema.duplicateCharges).values({
          subscriptionType: "brand_subscription",
          subscriptionId: randomUUID(),
          userId: randomUUID(),
          hitpayPaymentId: paymentId,
          amountSen: 50000n,
          currency: "MYR",
        })
      }),
    ).rejects.toThrow()

    // No cleanup: duplicate_charges has no DELETE policy by design (records are
    // permanent), so a withAdmin delete would silently affect 0 rows under FORCE
    // RLS. Tests use random ids/payment ids, so leftover rows never collide.
  })

  it("rejects amount_sen <= 0 (check constraint)", async () => {
    await expect(
      withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "neg" }, async (tx) => {
        await tx.insert(schema.duplicateCharges).values({
          subscriptionType: "member_subscription",
          subscriptionId: randomUUID(),
          userId: randomUUID(),
          hitpayPaymentId: `pay_${randomUUID()}`,
          amountSen: 0n,
          currency: "MYR",
        })
      }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 10: Run the test**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/db test duplicate_charges --run`
Expected: 2 passed.

- [ ] **Step 11: Typecheck + commit**

Run: `pnpm --filter @bomy/db typecheck` → no errors.

```bash
git add packages/db/src/types.ts packages/db/src/schema/enums.ts packages/db/src/schema/duplicate_charges.ts packages/db/src/schema/index.ts packages/db/drizzle/0016_duplicate_charge_reconciliation.sql packages/db/scripts/migrate.mjs packages/db/src/rls/policies.sql packages/db/tests/duplicate_charges.test.ts
git commit -m "feat(db): duplicate_charges table + duplicate_charge ledger source (0016)"
```

---

## Task 2: Detection — record duplicate charge + liability credit at both webhook sites

**Files:**

- Modify: `apps/api/src/routes/webhooks/hitpay.ts` (membership site ~`:244`, brand site ~`:536`, new helper)
- Test: `apps/api/tests/webhooks/hitpay.test.ts`

**Interfaces:**

- Consumes: `schema.duplicateCharges` (Task 1).
- Produces: `recordDuplicateCharge(tx, args)` helper — inserts the record (idempotent) and writes the liability credit only on first insert. `args: { subscriptionType: "member_subscription" | "brand_subscription"; subscriptionId: string; userId: string; paymentId: string; amountSen: bigint }`. Returns `Promise<boolean>` (true if a new record was created).

- [ ] **Step 1: Write the failing detection test (brand site)**

Add to `apps/api/tests/webhooks/hitpay.test.ts`, inside the brand-subscription `describe`. (`webhookInject`, `seedUser`, `seedStore`, `seedBrandPlan` already exist in the file.)

```ts
it("detection: late payment on an expired brand sub creates a duplicate_charges row + one liability credit", async () => {
  const ownerId = await seedUser("seller_owner")
  const buyerId = await seedUser()
  const storeId = await seedStore(ownerId)
  const planId = await seedBrandPlan(storeId)

  const paymentRequestId = `pr_${randomUUID()}`
  const paymentId = `pay_${randomUUID()}`
  const subId = randomUUID()
  const now = new Date()

  await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
    await tx.insert(schema.brandSubscriptions).values({
      id: subId,
      userId: buyerId,
      storeId,
      planId,
      status: "expired",
      priceMyrSen: 50000n,
      discountPct: 5,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 90 * 86400 * 1000),
      hitpayPaymentRequestId: paymentRequestId,
      bomyCommissionSen: 0n,
      brandPayoutSen: 0n,
    })
  })

  const res = await webhookInject(app, {
    payment_request_id: paymentRequestId,
    payment_id: paymentId,
    status: "completed",
    amount: "500.00",
    fees: "1.50",
  })
  expect(res.statusCode).toBe(200)

  const dup = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx
      .select()
      .from(schema.duplicateCharges)
      .where(eq(schema.duplicateCharges.hitpayPaymentId, paymentId)),
  )
  expect(dup).toHaveLength(1)
  expect(dup[0]?.subscriptionType).toBe("brand_subscription")
  expect(dup[0]?.subscriptionId).toBe(subId)
  expect(dup[0]?.amountSen).toBe(50000n)
  expect(dup[0]?.status).toBe("detected")

  const credits = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.idempotencyKey, `dup_charge:${paymentId}:credit`)),
  )
  expect(credits).toHaveLength(1)
  expect(credits[0]?.direction).toBe("credit")
  expect(credits[0]?.account).toBe("liability:duplicate_charge_payable")
  expect(credits[0]?.amountMinor).toBe(50000n)
  expect(credits[0]?.revenueSource).toBe("duplicate_charge")
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/api test hitpay.test.ts --run`
Expected: FAIL — `dup` has length 0 (no record written yet).

- [ ] **Step 3: Add the `recordDuplicateCharge` helper**

In `apps/api/src/routes/webhooks/hitpay.ts`, add this helper near the other module-level functions (after the imports / `SYSTEM_ACTOR` constant). `tx` is the Drizzle transaction type already used by the `withAdmin` callbacks in this file — copy the parameter type from an existing helper's `tx` (e.g. annotate as `Parameters<Parameters<typeof withAdmin>[2]>[0]`, matching how neighbouring helpers type it; if the file doesn't annotate, accept the inferred `tx` by inlining the helper body — see note).

```ts
// Records a duplicate subscription charge (a payment we will not honour) and
// books the inflow to a liability account. Idempotent: ON CONFLICT on the unique
// hitpay_payment_id means a retried webhook neither double-inserts nor
// double-credits. Returns true when this call created the record.
async function recordDuplicateCharge(
  tx: Parameters<Parameters<typeof withAdmin>[2]>[0],
  args: {
    subscriptionType: "member_subscription" | "brand_subscription"
    subscriptionId: string
    userId: string
    paymentId: string
    amountSen: bigint
  },
): Promise<boolean> {
  const inserted = await tx
    .insert(schema.duplicateCharges)
    .values({
      subscriptionType: args.subscriptionType,
      subscriptionId: args.subscriptionId,
      userId: args.userId,
      hitpayPaymentId: args.paymentId,
      amountSen: args.amountSen,
      currency: "MYR",
    })
    .onConflictDoNothing({ target: schema.duplicateCharges.hitpayPaymentId })
    .returning({ id: schema.duplicateCharges.id })

  if (inserted.length === 0) return false

  await tx.insert(schema.ledgerEntries).values({
    transactionId: randomUUID(),
    idempotencyKey: `dup_charge:${args.paymentId}:credit`,
    direction: "credit",
    account: "liability:duplicate_charge_payable",
    amountMinor: args.amountSen,
    currency: "MYR",
    revenueSource: "duplicate_charge",
    referenceId: inserted[0]!.id,
    referenceType: "duplicate_charge",
  })
  return true
}
```

> Note: if `Parameters<…>` typing is awkward in this file, type `tx` as `any`-free by reusing the existing pattern — the brand/membership handlers already receive a `tx` inside `withAdmin`; define the helper to take the same inferred type by declaring it as a local arrow inside each handler is NOT allowed (DRY). Prefer the `Parameters` form above; it compiles against `tenant.ts`'s exported `withAdmin`.

- [ ] **Step 4: Call it at the brand-sub site**

In the brand `activated.length === 0` block (currently the IS-NULL stamp + `log.error`, ~`:536`), keep the `hitpay_payment_id` stamp and add the record call before the log:

```ts
if (activated.length === 0) {
  // ... existing IS-NULL stamp of hitpay_payment_id stays ...
  await recordDuplicateCharge(tx, {
    subscriptionType: "brand_subscription",
    subscriptionId: sub.id,
    userId: sub.userId,
    paymentId,
    amountSen: webhookAmountSen,
  })
  app.log.error(
    { paymentId, subId: sub.id, priorStatus: sub.status },
    "hitpay webhook: brand sub payment for non-pending row — recorded duplicate, needs refund/reconciliation",
  )
  return
}
```

(`webhookAmountSen` is already parsed+amount-guarded above in this branch; it equals `sub.priceMyrSen`.)

- [ ] **Step 5: Run the brand detection test → passes**

Run: `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/api test hitpay.test.ts --run`
Expected: the new brand detection test PASSES.

- [ ] **Step 6: Write the membership detection + idempotency tests**

Add to the membership `describe`. For the already-active duplicate, seed an active membership then inject a recurring charge for a _different_ pending/expired row. Model the seed on the existing "already active — possible double charge" test (search `already active` in the file) — reuse its exact seeding, then assert:

```ts
it("detection: recurring charge while already active creates a duplicate_charges row + liability credit", async () => {
  // ... reuse the existing already-active seed (active member sub + a second
  // charged row via recurring_billing_id) ...
  const res = await webhookInject(app, {
    /* same recurring payload as the existing test */
  })
  expect(res.statusCode).toBe(200)

  const dup = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx
      .select()
      .from(schema.duplicateCharges)
      .where(eq(schema.duplicateCharges.hitpayPaymentId, paymentId)),
  )
  expect(dup).toHaveLength(1)
  expect(dup[0]?.subscriptionType).toBe("member_subscription")

  const credits = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.idempotencyKey, `dup_charge:${paymentId}:credit`)),
  )
  expect(credits).toHaveLength(1)
  expect(credits[0]?.account).toBe("liability:duplicate_charge_payable")
})

it("idempotency: re-delivered duplicate webhook → still one row, one credit", async () => {
  // ... seed the same brand expired row as the brand detection test ...
  const payload = {
    payment_request_id: paymentRequestId,
    payment_id: paymentId,
    status: "completed",
    amount: "500.00",
    fees: "1.50",
  }
  await webhookInject(app, payload)
  await webhookInject(app, payload) // retry

  const dup = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx
      .select()
      .from(schema.duplicateCharges)
      .where(eq(schema.duplicateCharges.hitpayPaymentId, paymentId)),
  )
  expect(dup).toHaveLength(1)
  const credits = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.idempotencyKey, `dup_charge:${paymentId}:credit`)),
  )
  expect(credits).toHaveLength(1)
})
```

- [ ] **Step 7: Call `recordDuplicateCharge` at the membership site**

In the membership `activeRows[0]` branch (~`:244`), keep the existing `hitpay_payment_id` stamp and add before its `log.error`:

```ts
await recordDuplicateCharge(tx, {
  subscriptionType: "member_subscription",
  subscriptionId: sub.id,
  userId: sub.userId,
  paymentId,
  amountSen: sub.priceMyrSen,
})
```

(The membership row's charged amount is `sub.priceMyrSen`. If this site has an amount variable already parsed from the webhook, prefer that; otherwise `sub.priceMyrSen` is the subscribed price.)

- [ ] **Step 8: Run the full webhook suite → all pass**

Run: `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/api test hitpay.test.ts --run`
Expected: all pass (existing + 3 new detection/idempotency tests).

- [ ] **Step 9: Typecheck, lint, commit**

Run: `pnpm --filter @bomy/api typecheck && pnpm --filter @bomy/api lint`

```bash
git add apps/api/src/routes/webhooks/hitpay.ts apps/api/tests/webhooks/hitpay.test.ts
git commit -m "feat(api): record duplicate charges + liability credit at webhook detection sites"
```

---

## Task 3: Duplicate-aware `handleRefund`

**Files:**

- Modify: `apps/api/src/routes/webhooks/hitpay.ts` (`handleRefund`, ~`:650`)
- Test: `apps/api/tests/webhooks/hitpay.test.ts`

**Interfaces:**

- Consumes: `schema.duplicateCharges`, `recordDuplicateCharge` (for seeding parity in tests).
- Produces: `handleRefund` checks `duplicate_charges` by `hitpay_payment_id` **before** the member/brand revenue paths; on a full-amount match writes a liability **debit** and marks the row `refunded`.

- [ ] **Step 1: Write failing test — duplicate refund routes to liability debit, not revenue**

Add to the refund `describe` in `apps/api/tests/webhooks/hitpay.test.ts`:

```ts
it("refund webhook for a duplicate charge → liability debit, status refunded, no revenue debit", async () => {
  const buyerId = await seedUser()
  const paymentId = `pay_${randomUUID()}`
  const refundId = `ref_${randomUUID()}`
  const dupId = await withAdmin(
    setupDb.db,
    { userId: SYSTEM_ACTOR, reason: "seed" },
    async (tx) => {
      const [row] = await tx
        .insert(schema.duplicateCharges)
        .values({
          subscriptionType: "brand_subscription",
          subscriptionId: randomUUID(),
          userId: buyerId,
          hitpayPaymentId: paymentId,
          amountSen: 50000n,
          currency: "MYR",
          status: "refund_pending",
          hitpayRefundId: refundId,
        })
        .returning({ id: schema.duplicateCharges.id })
      // detection credit (so the account can net to zero)
      await tx.insert(schema.ledgerEntries).values({
        transactionId: randomUUID(),
        idempotencyKey: `dup_charge:${paymentId}:credit`,
        direction: "credit",
        account: "liability:duplicate_charge_payable",
        amountMinor: 50000n,
        currency: "MYR",
        revenueSource: "duplicate_charge",
        referenceId: row!.id,
        referenceType: "duplicate_charge",
      })
      return row!.id
    },
  )

  // charge.updated is routed by the hitpay-event-type HEADER, not the body
  // (matches the existing refund tests in this file).
  const res = await webhookInject(
    app,
    { payment_id: paymentId, refund_amount: "500.00", refund_id: refundId, status: "refunded" },
    { "hitpay-event-type": "charge.updated" },
  )
  expect(res.statusCode).toBe(200)

  const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.referenceId, dupId)),
  )
  const debit = legs.find((l) => l.direction === "debit")
  expect(debit?.account).toBe("liability:duplicate_charge_payable")
  expect(debit?.amountMinor).toBe(50000n)
  expect(legs.some((l) => l.account.startsWith("revenue:"))).toBe(false)

  const row = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
    tx.select().from(schema.duplicateCharges).where(eq(schema.duplicateCharges.id, dupId)),
  )
  expect(row[0]?.status).toBe("refunded")
  expect(row[0]?.resolvedAt).not.toBeNull()
})
```

> The other refund tests in Steps 5 use the same injection shape: body
> `{ payment_id, refund_amount, refund_id?, status: "refunded" }` plus header
> `{ "hitpay-event-type": "charge.updated" }` (see the existing `refund (charge.updated)`
> describe block, ~line 1058 of the test file).

- [ ] **Step 2: Run → fails (writes revenue debit / nothing)**

Run: `... pnpm --filter @bomy/api test hitpay.test.ts --run` → FAIL.

- [ ] **Step 3: Add the duplicate-aware branch in `handleRefund`**

In `handleRefund`, inside the `withAdmin` callback, **before** the `memberSubscriptions` lookup, add:

```ts
// Duplicate-charge refunds clear the liability account, never revenue.
// Checked first because the duplicate payment_id is also stamped on the
// subscription row, which the member/brand lookups below would match.
const dupRows = await tx
  .select()
  .from(schema.duplicateCharges)
  .where(eq(schema.duplicateCharges.hitpayPaymentId, paymentId))
  .limit(1)

if (dupRows[0]) {
  const dup = dupRows[0]

  // Full-amount guard: duplicates are always full-price. A partial/mismatched
  // refund is an anomaly for a human — do not debit, do not mark refunded,
  // do not fall through to the revenue path.
  if (refundAmountSen !== dup.amountSen) {
    app.log.error(
      { paymentId, dupId: dup.id, refundAmountSen, expected: dup.amountSen },
      "hitpay webhook: partial/mismatched refund on a duplicate charge — manual review",
    )
    return
  }

  const idemKey = refundId
    ? `dup_charge:${paymentId}:${refundId}:debit`
    : `dup_charge:${paymentId}:debit`

  const existing = await tx
    .select({ id: schema.ledgerEntries.id })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.idempotencyKey, idemKey),
        eq(schema.ledgerEntries.direction, "debit"),
      ),
    )
    .limit(1)

  if (existing[0] || dup.status === "refunded") {
    app.log.info({ paymentId }, "hitpay webhook: duplicate charge refund already recorded")
    return
  }

  await tx.insert(schema.ledgerEntries).values({
    transactionId: randomUUID(),
    idempotencyKey: idemKey,
    direction: "debit",
    account: "liability:duplicate_charge_payable",
    amountMinor: refundAmountSen,
    currency: "MYR",
    revenueSource: "duplicate_charge",
    referenceId: dup.id,
    referenceType: "duplicate_charge",
  })
  await tx
    .update(schema.duplicateCharges)
    .set({
      status: "refunded",
      resolvedAt: new Date(),
      hitpayRefundId: dup.hitpayRefundId ?? refundId,
    })
    .where(eq(schema.duplicateCharges.id, dup.id))
  app.log.info({ paymentId, dupId: dup.id }, "hitpay webhook: duplicate charge refund reconciled")
  return
}
```

(`refundId` and `refundAmountSen` are already in scope in `handleRefund`.)

- [ ] **Step 4: Run the duplicate-refund test → passes**

Run: `... pnpm --filter @bomy/api test hitpay.test.ts --run` → the new test PASSES.

- [ ] **Step 5: Add the remaining refund tests**

Add three more to the refund `describe`:

```ts
it("refund webhook for a NORMAL subscription payment still uses the revenue path", async () => {
  // seed an ACTIVE brand sub with hitpayPaymentId = paymentId (a real prior sale),
  // no duplicate_charges row. Inject the same refund payload. Assert a debit to
  // account 'revenue:brand_subscription' exists (existing behaviour, unchanged).
})

it("idempotent: a re-delivered duplicate refund webhook writes no second debit", async () => {
  // seed as in Step 1 but status 'detected'. Inject the refund payload twice.
  // Assert exactly one liability debit and status 'refunded'.
})

it("full-amount guard: a partial refund on a duplicate writes no debit and leaves status unchanged", async () => {
  // seed duplicate amountSen 50000n status 'refund_pending'. Inject refund_amount "300.00".
  // Assert: no debit leg for the dup, status still 'refund_pending', no revenue debit.
})
```

(The "paid-then-expired original payment id not clobbered" guarantee from PR #71 already has a test in this file — verify it still passes; no new test needed.)

- [ ] **Step 6: Run full suite, typecheck, lint, commit**

Run: `... pnpm --filter @bomy/api test --run && pnpm --filter @bomy/api typecheck && pnpm --filter @bomy/api lint`
Expected: all green.

```bash
git add apps/api/src/routes/webhooks/hitpay.ts apps/api/tests/webhooks/hitpay.test.ts
git commit -m "feat(api): duplicate-aware handleRefund clears liability, not revenue"
```

---

## Task 4: Admin refund action

**Files:**

- Create: `apps/admin/src/app/payouts/reconciliation/actions.ts`
- Test: `apps/admin/tests/reconciliation/refund-action.test.ts`

**Interfaces:**

- Consumes: `schema.duplicateCharges`, `requireRole`, `HitPayClient.createRefund`, `senToMyr`.
- Produces: `refundDuplicateCharge(id: string): Promise<{ ok: true } | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "ALREADY_PROCESSING" | "REFUND_FAILED" | "REFUND_OUTCOME_UNKNOWN" }>`.

- [ ] **Step 1: Write the failing action test**

Create `apps/admin/tests/reconciliation/refund-action.test.ts`. Mock `@/auth` and partially-mock `@bomy/hitpay` so `HitPayError` stays real (PR #50 pattern):

```ts
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, type Mock, vi } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
const createRefund = vi.fn()
vi.mock("@bomy/hitpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@bomy/hitpay")>()
  return { ...actual, HitPayClient: vi.fn(() => ({ createRefund })) }
})

import { auth } from "@/auth"
import { HitPayError } from "@bomy/hitpay"
import { refundDuplicateCharge } from "../../src/app/payouts/reconciliation/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("refundDuplicateCharge", () => {
  let db: ReturnType<typeof makeDb>
  let adminId: string

  beforeAll(async () => {
    process.env["HITPAY_API_KEY"] = "k"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    db = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: adminId, email: `${adminId}@test.bomy`, role: "bomy_finance" })
    })
  })
  afterAll(async () => {
    await db.close()
  })

  async function seedDup(status: "detected" | "refund_pending" = "detected") {
    const id = randomUUID()
    const paymentId = `pay_${randomUUID()}`
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx.insert(schema.duplicateCharges).values({
        id,
        subscriptionType: "brand_subscription",
        subscriptionId: randomUUID(),
        userId: randomUUID(),
        hitpayPaymentId: paymentId,
        amountSen: 50000n,
        currency: "MYR",
        status,
      })
    })
    return { id, paymentId }
  }
  function read(id: string) {
    return withAdmin(
      db.db,
      { userId: SYSTEM_ACTOR, reason: "read" },
      async (tx) =>
        (
          await tx.select().from(schema.duplicateCharges).where(eq(schema.duplicateCharges.id, id))
        )[0],
    )
  }

  it("happy path: CAS to refund_pending, calls createRefund once, stores refund id", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_finance" } })
    createRefund.mockResolvedValue({
      id: "ref_x",
      payment_id: "p",
      amount_refunded: "500.00",
      payment_method: "card",
      status: "pending",
      created_at: "",
    })
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: true })
    expect(createRefund).toHaveBeenCalledTimes(1)
    expect(createRefund.mock.calls[0]![0]).toMatchObject({ amount: "500.00" })
    const row = await read(id)
    expect(row?.status).toBe("refund_pending")
    expect(row?.hitpayRefundId).toBe("ref_x")
    expect(row?.resolvedBy).toBe(adminId)
  })

  it("rejects bomy_ops", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_ops" } })
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "FORBIDDEN" })
    expect(createRefund).not.toHaveBeenCalled()
    expect((await read(id))?.status).toBe("detected")
  })

  it("no-op when not detected (already refund_pending)", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const { id } = await seedDup("refund_pending")
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "ALREADY_PROCESSING" })
    expect(createRefund).not.toHaveBeenCalled()
  })

  it("HitPayError reverts status to detected", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    createRefund.mockRejectedValue(new HitPayError("rejected", 422, {}))
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "REFUND_FAILED" })
    expect((await read(id))?.status).toBe("detected")
  })

  it("unknown/network error → REFUND_OUTCOME_UNKNOWN, row stays refund_pending (no throw)", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    // A plain Error (not HitPayError) = indeterminate outcome.
    createRefund.mockRejectedValue(new Error("ETIMEDOUT"))
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "REFUND_OUTCOME_UNKNOWN" })
    expect((await read(id))?.status).toBe("refund_pending")
  })
})
```

(`HitPayError`'s constructor is `(message, statusCode, body)` — see `packages/hitpay/src/errors.ts`.)

- [ ] **Step 2: Run → fails (action does not exist)**

Run: `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/admin test reconciliation --run` → FAIL (module not found).

- [ ] **Step 3: Implement the action**

Create `apps/admin/src/app/payouts/reconciliation/actions.ts`:

```ts
"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { HitPayClient, HitPayError } from "@bomy/hitpay"

import { auth } from "@/auth"
import { requireRole } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"

const PAYOUT_ROLES = ["bomy_admin", "bomy_finance"] as const

type Result =
  | { ok: true }
  | {
      ok: false
      error:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "ALREADY_PROCESSING"
        | "REFUND_FAILED"
        | "REFUND_OUTCOME_UNKNOWN"
    }

function hitpayClient(): HitPayClient {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  if (!apiKey) throw new Error("HITPAY_API_KEY is required")
  if (!apiUrl) throw new Error("HITPAY_API_URL is required")
  return new HitPayClient({ apiKey, baseUrl: apiUrl })
}

export async function refundDuplicateCharge(id: string): Promise<Result> {
  const session = await auth()
  let adminId: string
  try {
    adminId = requireRole(session, [...PAYOUT_ROLES])
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED",
    }
  }

  // CAS the row to refund_pending BEFORE any external call. Closes the
  // double-click / double-refund window: only one caller can flip detected→pending.
  const claimed = await withAdmin(
    getDb(),
    { userId: adminId, reason: "claim duplicate charge for refund" },
    async (tx) =>
      tx
        .update(schema.duplicateCharges)
        .set({ status: "refund_pending", resolvedBy: adminId })
        .where(
          and(eq(schema.duplicateCharges.id, id), eq(schema.duplicateCharges.status, "detected")),
        )
        .returning({
          id: schema.duplicateCharges.id,
          hitpayPaymentId: schema.duplicateCharges.hitpayPaymentId,
          amountSen: schema.duplicateCharges.amountSen,
        }),
  )

  if (claimed.length === 0) {
    // Either it does not exist or it is no longer 'detected' (already handled).
    const exists = await withAdmin(
      getDb(),
      { userId: adminId, reason: "check duplicate charge" },
      async (tx) =>
        tx
          .select({ id: schema.duplicateCharges.id })
          .from(schema.duplicateCharges)
          .where(eq(schema.duplicateCharges.id, id))
          .limit(1),
    )
    return { ok: false, error: exists.length === 0 ? "NOT_FOUND" : "ALREADY_PROCESSING" }
  }

  const row = claimed[0]!
  try {
    const refund = await hitpayClient().createRefund({
      payment_id: row.hitpayPaymentId,
      amount: senToMyr(row.amountSen),
      reason: "Duplicate subscription charge",
    })
    await withAdmin(
      getDb(),
      { userId: adminId, reason: "store duplicate charge refund id" },
      async (tx) =>
        tx
          .update(schema.duplicateCharges)
          .set({ hitpayRefundId: refund.id })
          .where(eq(schema.duplicateCharges.id, row.id)),
    )
    revalidatePath("/payouts/reconciliation")
    return { ok: true }
  } catch (err) {
    if (err instanceof HitPayError) {
      // Definite API rejection — the refund was NOT issued. Revert so an admin can retry.
      await withAdmin(
        getDb(),
        { userId: adminId, reason: "revert duplicate charge refund (HitPay rejected)" },
        async (tx) =>
          tx
            .update(schema.duplicateCharges)
            .set({ status: "detected", resolvedBy: null })
            .where(
              and(
                eq(schema.duplicateCharges.id, row.id),
                eq(schema.duplicateCharges.status, "refund_pending"),
              ),
            ),
      )
      return { ok: false, error: "REFUND_FAILED" }
    }
    // Unknown/network error — outcome indeterminate. Leave it refund_pending for
    // manual verification; do NOT revert (we cannot prove no charge was refunded).
    // Return (do not throw) so the client button shows an error instead of crashing.
    console.error("refundDuplicateCharge: HitPay refund outcome unknown", { id: row.id, err })
    revalidatePath("/payouts/reconciliation")
    return { ok: false, error: "REFUND_OUTCOME_UNKNOWN" }
  }
}
```

- [ ] **Step 4: Run the action tests → pass**

Run: `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/admin test reconciliation --run`
Expected: 4 passed.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @bomy/admin typecheck && pnpm --filter @bomy/admin lint`

```bash
git add apps/admin/src/app/payouts/reconciliation/actions.ts apps/admin/tests/reconciliation/refund-action.test.ts
git commit -m "feat(admin): refundDuplicateCharge action with CAS guard + failure handling"
```

---

## Task 5: Admin reconciliation UI section

**Files:**

- Modify: `apps/admin/src/app/payouts/reconciliation/page.tsx`
- Create: `apps/admin/src/app/payouts/reconciliation/_refund-button.tsx`

**Interfaces:**

- Consumes: `refundDuplicateCharge` (Task 4), `schema.duplicateCharges`, the session role.

- [ ] **Step 1: Add the client refund button**

Create `apps/admin/src/app/payouts/reconciliation/_refund-button.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"

import { refundDuplicateCharge } from "./actions"

export function RefundButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const res = await refundDuplicateCharge(id)
            if (!res.ok) setError(res.error)
          })
        }
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Refunding…" : "Refund"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
```

- [ ] **Step 2: Add the "Duplicate charges" section + role-gated button to the page**

In `apps/admin/src/app/payouts/reconciliation/page.tsx`: read the current session role, fetch `detected` + `refund_pending` rows, render a section. Add to the `Promise.all` a query:

```ts
withAdmin(getDb(), { userId: SYSTEM_ACTOR, reason: "admin list duplicate charges" }, async (tx) =>
  tx.select().from(schema.duplicateCharges)
    .where(inArray(schema.duplicateCharges.status, ["detected", "refund_pending"]))
    .orderBy(asc(schema.duplicateCharges.detectedAt))),
```

(Add `inArray` to the drizzle import.) Read the role for the UI gate:

```ts
import { auth } from "@/auth"
const session = await auth()
const canRefund = ["bomy_admin", "bomy_finance"].includes(
  (session?.user as { role?: string } | undefined)?.role ?? "",
)
```

Render the section (`senToMyr` already imported on this page):

```tsx
<section>
  <h2 className="mb-4 text-lg font-semibold text-gray-800">
    Duplicate charges ({duplicateCharges.length})
  </h2>
  <p className="mb-4 text-sm text-gray-500">
    Payments received for an entitlement we will not honour. Refunding clears the
    liability:duplicate_charge_payable account.
  </p>
  {duplicateCharges.length === 0 ? (
    <p className="text-sm text-gray-400">None.</p>
  ) : (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm text-gray-700">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left">Customer</th>
            <th className="px-4 py-3 text-left">Type</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-left">Payment ID</th>
            <th className="px-4 py-3 text-left">Detected</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {duplicateCharges.map((d) => (
            <tr key={d.id} className="border-t border-gray-100">
              <td className="px-4 py-3 font-mono text-xs">{d.userId}</td>
              <td className="px-4 py-3">
                {d.subscriptionType === "member_subscription" ? "Membership" : "Brand"}
              </td>
              <td className="px-4 py-3 text-right">RM{senToMyr(d.amountSen)}</td>
              <td className="px-4 py-3 font-mono text-xs">{d.hitpayPaymentId}</td>
              <td className="px-4 py-3">{d.detectedAt.toISOString().slice(0, 10)}</td>
              <td className="px-4 py-3">{d.status}</td>
              <td className="px-4 py-3">
                {d.status === "detected" && canRefund ? (
                  <RefundButton id={d.id} />
                ) : d.status === "refund_pending" ? (
                  <span className="text-xs text-gray-400">Refund pending</span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>
```

Add `import { RefundButton } from "./_refund-button"` at the top.

- [ ] **Step 3: Typecheck, lint, build the admin app**

Run: `pnpm --filter @bomy/admin typecheck && pnpm --filter @bomy/admin lint`
Expected: clean. (Reconciliation page has no unit test in this repo; correctness of the action is covered by Task 4. Verify the page compiles.)

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/payouts/reconciliation/page.tsx apps/admin/src/app/payouts/reconciliation/_refund-button.tsx
git commit -m "feat(admin): duplicate-charges section on reconciliation page (role-gated refund)"
```

---

## Task 6: Full-suite verification + PR

- [ ] **Step 1: Run all suites**

Run, in order:

- `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/db test --run`
- `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/api test --run`
- `DATABASE_URL=... DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/admin test --run`
- `pnpm typecheck && pnpm lint`

Expected: all green.

- [ ] **Step 2: Open the PR**

Push `feat/duplicate-charge-reconciliation` and open a PR summarising: new `duplicate_charges` table + `duplicate_charge` ledger source; detection at both webhook sites; duplicate-aware `handleRefund`; admin one-click refund. Note the migration `0016` must be applied to prod Neon before deploy. **Do not self-merge** — await Bob's review.

---

## Self-review notes

- **Spec coverage:** table/enum/grants/RLS → Task 1; detection + idempotency → Task 2; duplicate-aware refund + full-amount guard → Task 3; admin action + CAS + failure story + role gate → Task 4; role-gated UI → Task 5; all eight spec tests mapped (1–2 Task 2; 3,4,6,7 Task 3; 5 carried from #71; 8 Task 4).
- **Migration risk** (spec): resolved — `applySqlFile` runs each breakpoint statement in its own implicit transaction, so `ALTER TYPE ADD VALUE` commits before reuse.
- **Resolved after Bob review:** unknown/network refund errors return `REFUND_OUTCOME_UNKNOWN` (no throw through the client button); DB test does not delete (no DELETE policy by design); refund webhook tests use the `hitpay-event-type` header with body `{ payment_id, refund_amount, refund_id?, status }`; `HitPayError("rejected", 422, {})`; `policies.sql` gets ENABLE/FORCE + the four policies.
- **One open verification point for the implementer** (flagged inline, not a placeholder): the exact `tx` parameter type for the `recordDuplicateCharge` helper in `hitpay.ts` — use `Parameters<Parameters<typeof withAdmin>[2]>[0]`, with the in-step fallback if that proves awkward.
