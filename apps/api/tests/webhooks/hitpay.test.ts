/**
 * Integration tests — POST /webhooks/hitpay
 *
 * Requires a live Postgres with the bomy_app role and applied migrations.
 * The webhook handler writes via withAdmin (bypass_rls), so DATABASE_URL
 * (superuser or bomy_app + bypass) is sufficient. Tests skip if no DB URL.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/api test
 */
import { createHash, createHmac, randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createApp } from "../../src/server.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const TEST_SALT = "test-webhook-salt"

function makeSignature(rawBody: string): string {
  return createHmac("sha256", TEST_SALT).update(rawBody).digest("hex")
}

function webhookInject(
  app: Awaited<ReturnType<typeof createApp>>,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  const body = JSON.stringify(payload)
  return app.inject({
    method: "POST",
    url: "/webhooks/hitpay",
    headers: {
      "content-type": "application/json",
      "hitpay-signature": makeSignature(body),
      ...extraHeaders,
    },
    body,
  })
}

describe.skipIf(!shouldRun)("POST /webhooks/hitpay", () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let setupDb: ReturnType<typeof makeDb>

  beforeAll(async () => {
    process.env["HITPAY_SALT"] = TEST_SALT
    setupDb = makeDb({ url: DATABASE_URL as string })
    app = await createApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await setupDb.close()
  })

  // ── helpers ────────────────────────────────────────────────────────────────

  async function seedUser(role: "buyer" | "seller_owner" = "buyer") {
    const id = randomUUID()
    await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values({ id, email: `${id}@test.bomy`, role })
    })
    return id
  }

  async function seedStore(ownerId: string) {
    const id = randomUUID()
    await withAdmin(setupDb.db, { userId: ownerId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.stores).values({
        id,
        ownerId,
        name: "Test Store",
        slug: `store-${id}`,
        status: "active",
      })
    })
    return id
  }

  async function seedBrandPlan(storeId: string) {
    const id = randomUUID()
    const actorId = randomUUID()
    await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: actorId, email: `${actorId}@test.bomy`, role: "bomy_admin" })
      await tx.insert(schema.brandSubscriptionPlans).values({
        id,
        storeId,
        termMonths: 3,
        priceMyrSen: 50000n,
        discountPct: 5,
        isActive: true,
      })
    })
    return id
  }

  // ── invalid signature ──────────────────────────────────────────────────────

  describe("signature verification", () => {
    it("returns 401 for a tampered signature", async () => {
      const body = JSON.stringify({ payment_id: "pay_xxx", status: "succeeded", amount: "75.00" })
      const res = await app.inject({
        method: "POST",
        url: "/webhooks/hitpay",
        headers: {
          "content-type": "application/json",
          "hitpay-signature": "deadbeef",
        },
        body,
      })
      expect(res.statusCode).toBe(401)
    })

    it("returns 200 for a valid signature even if no matching subscription", async () => {
      const res = await webhookInject(app, {
        payment_id: "pay_unknown",
        payment_request_id: "pr_unknown",
        status: "completed",
        amount: "50.00",
        fees: "1.00",
      })
      expect(res.statusCode).toBe(200)
    })
  })

  // ── platform membership ────────────────────────────────────────────────────

  describe("membership charge (recurring_billing_id present)", () => {
    it("activates a pending member_subscription on charge.succeeded", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`

      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "pending",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
        })
      })

      const res = await webhookInject(app, {
        recurring_billing_id: recurringId,
        payment_id: paymentId,
        status: "succeeded",
        amount: "75.00",
      })

      expect(res.statusCode).toBe(200)

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
      )
      expect(rows[0]?.status).toBe("active")
      expect(rows[0]?.hitpayPaymentId).toBe(paymentId)

      const ledger = await withAdmin(
        setupDb.db,
        { userId: buyerId, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.ledgerEntries)
            .where(
              and(
                eq(schema.ledgerEntries.referenceId, subId),
                eq(schema.ledgerEntries.direction, "credit"),
              ),
            ),
      )
      expect(ledger).toHaveLength(1)
      expect(ledger[0]?.amountMinor).toBe(7500n)
      expect(ledger[0]?.revenueSource).toBe("platform_subscription")
    })

    it("is idempotent — second call with same payment_id skips writes", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`

      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
          hitpayPaymentId: paymentId,
        })
      })

      const payload = {
        recurring_billing_id: recurringId,
        payment_id: paymentId,
        status: "succeeded",
        amount: "75.00",
      }

      const res1 = await webhookInject(app, payload)
      const res2 = await webhookInject(app, payload)

      expect(res1.statusCode).toBe(200)
      expect(res2.statusCode).toBe(200)

      const ledger = await withAdmin(
        setupDb.db,
        { userId: buyerId, reason: "verify" },
        async (tx) =>
          tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.referenceId, subId)),
      )
      expect(ledger).toHaveLength(0)
    })

    it("sets status = payment_failed on failed charge", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "pending",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
        })
      })

      await webhookInject(app, {
        recurring_billing_id: recurringId,
        payment_id: paymentId,
        status: "failed",
        amount: "75.00",
      })

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
      )
      expect(rows[0]?.status).toBe("payment_failed")
    })

    it("renewal retry — second webhook with same payment_id is idempotent after renewal", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const firstPaymentId = `pay_${randomUUID()}`
      const renewalPaymentId = `pay_${randomUUID()}`

      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
          hitpayPaymentId: firstPaymentId,
        })
      })

      // First renewal: creates a new active row, expires the old one.
      const res1 = await webhookInject(app, {
        recurring_billing_id: recurringId,
        payment_id: renewalPaymentId,
        status: "succeeded",
        amount: "75.00",
      })
      expect(res1.statusCode).toBe(200)

      // Retry of the same renewal: ORDER BY created_at DESC reads the new
      // active row (hitpayPaymentId = renewalPaymentId) and skips.
      const res2 = await webhookInject(app, {
        recurring_billing_id: recurringId,
        payment_id: renewalPaymentId,
        status: "succeeded",
        amount: "75.00",
      })
      expect(res2.statusCode).toBe(200)

      // Exactly one ledger credit for the renewal payment.
      const ledger = await withAdmin(
        setupDb.db,
        { userId: buyerId, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.ledgerEntries)
            .where(
              and(
                eq(
                  schema.ledgerEntries.idempotencyKey,
                  `membership:recurring:${renewalPaymentId}:credit`,
                ),
                eq(schema.ledgerEntries.direction, "credit"),
              ),
            ),
      )
      expect(ledger).toHaveLength(1)
    })

    it("aborts activation when webhook amount does not match price", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "pending",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
        })
      })

      // Wrong amount: "50.00" (5000 sen) instead of "75.00" (7500 sen).
      await webhookInject(app, {
        recurring_billing_id: recurringId,
        payment_id: paymentId,
        status: "succeeded",
        amount: "50.00",
      })

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
      )
      // Row must still be pending — activation aborted.
      expect(rows[0]?.status).toBe("pending")
      expect(rows[0]?.hitpayPaymentId).toBeNull()
    })

    it("cancellation event before period_end: keeps status active, sets cancelledAt, preserves payment_id", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const existingPaymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
          hitpayPaymentId: existingPaymentId,
        })
      })

      // Cancellation event fires before period_end — entitlement must be preserved.
      await webhookInject(
        app,
        {
          recurring_billing_id: recurringId,
          status: "cancelled",
          amount: "0.00",
        },
        { "hitpay-event-type": "recurring_billing.subscription_updated" },
      )

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
      )
      // Status stays active — membership valid until periodEnd.
      expect(rows[0]?.status).toBe("active")
      expect(rows[0]?.cancelledAt).not.toBeNull()
      // Existing payment_id must not be overwritten with an empty string.
      expect(rows[0]?.hitpayPaymentId).toBe(existingPaymentId)
    })

    it("cancellation event after period_end revokes entitlement", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const existingPaymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      // period_end set 1 day in the past — entitlement has expired.
      const periodEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const periodStart = new Date(periodEnd.getTime() - 365 * 24 * 60 * 60 * 1000)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart,
          periodEnd,
          hitpayRecurringId: recurringId,
          hitpayPaymentId: existingPaymentId,
        })
      })

      await webhookInject(
        app,
        {
          recurring_billing_id: recurringId,
          status: "cancelled",
          amount: "0.00",
        },
        { "hitpay-event-type": "recurring_billing.subscription_updated" },
      )

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
      )
      expect(rows[0]?.status).toBe("cancelled")
      expect(rows[0]?.cancelledAt).not.toBeNull()
    })

    it("late succeeded webhook on an abandoned (expired, never-paid) checkout activates it fresh — not as a future-dated renewal", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()

      // Abandoned checkout expired by "Start over" / the reaper: never paid
      // (no hitpayPaymentId), and its period bounds are stale (set ~1y from the
      // original join an hour ago).
      const joinTime = new Date(Date.now() - 60 * 60 * 1000)
      const stalePeriodEnd = new Date(joinTime)
      stalePeriodEnd.setFullYear(stalePeriodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "expired",
          priceMyrSen: 7500n,
          periodStart: joinTime,
          periodEnd: stalePeriodEnd,
          hitpayRecurringId: recurringId,
        })
      })

      const before = Date.now()
      const res = await webhookInject(app, {
        recurring_billing_id: recurringId,
        payment_id: paymentId,
        status: "succeeded",
        amount: "75.00",
      })
      expect(res.statusCode).toBe(200)

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.userId, buyerId)),
      )
      // Activated in place — NOT a renewal that inserts a second row.
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toBe(subId)
      expect(rows[0]?.status).toBe("active")
      expect(rows[0]?.hitpayPaymentId).toBe(paymentId)
      // Membership starts NOW, not a year in the future.
      const periodStart = rows[0]!.periodStart.getTime()
      expect(periodStart).toBeGreaterThanOrEqual(before - 5000)
      expect(periodStart).toBeLessThanOrEqual(Date.now() + 5000)
      const expectedEnd = new Date(rows[0]!.periodStart)
      expectedEnd.setFullYear(expectedEnd.getFullYear() + 1)
      expect(rows[0]!.periodEnd.getTime()).toBe(expectedEnd.getTime())

      const ledger = await withAdmin(
        setupDb.db,
        { userId: buyerId, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.ledgerEntries)
            .where(
              and(
                eq(schema.ledgerEntries.referenceId, subId),
                eq(schema.ledgerEntries.direction, "credit"),
              ),
            ),
      )
      expect(ledger).toHaveLength(1)
      expect(ledger[0]?.amountMinor).toBe(7500n)
      expect(ledger[0]?.revenueSource).toBe("platform_subscription")
    })

    it("late webhook activating an abandoned checkout expires a newer pending sibling, so the newer payment does not 500", async () => {
      const buyerId = await seedUser()
      const oldRecurringId = `rb_${randomUUID()}`
      const newRecurringId = `rb_${randomUUID()}`
      const oldPaymentId = `pay_${randomUUID()}`
      const newPaymentId = `pay_${randomUUID()}`
      const oldId = randomUUID()
      const newId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        // Old checkout abandoned via "Start over" → expired, never paid.
        await tx.insert(schema.memberSubscriptions).values({
          id: oldId,
          userId: buyerId,
          status: "expired",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: oldRecurringId,
        })
        // New checkout the user started afterwards: pending, never paid.
        await tx.insert(schema.memberSubscriptions).values({
          id: newId,
          userId: buyerId,
          status: "pending",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: newRecurringId,
        })
      })

      // Old checkout's late payment lands FIRST — activates the old row.
      const res1 = await webhookInject(app, {
        recurring_billing_id: oldRecurringId,
        payment_id: oldPaymentId,
        status: "succeeded",
        amount: "75.00",
      })
      expect(res1.statusCode).toBe(200)

      // Then the user also pays the newer checkout. This must NOT 500.
      const res2 = await webhookInject(app, {
        recurring_billing_id: newRecurringId,
        payment_id: newPaymentId,
        status: "succeeded",
        amount: "75.00",
      })
      expect(res2.statusCode).toBe(200)

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.userId, buyerId)),
      )
      // Exactly one active membership (the old checkout that paid first).
      const active = rows.filter((r) => r.status === "active")
      expect(active).toHaveLength(1)
      expect(active[0]?.id).toBe(oldId)
      // The newer checkout was expired on activation, and its later payment is
      // recorded for refund rather than breaching the one-active-row index.
      const newer = rows.find((r) => r.id === newId)
      expect(newer?.status).toBe("expired")
      expect(newer?.hitpayPaymentId).toBe(newPaymentId)
    })

    it("late succeeded webhook on an abandoned checkout does NOT double-activate when the user is already a member", async () => {
      const buyerId = await seedUser()
      const abandonedRecurringId = `rb_${randomUUID()}`
      const activeRecurringId = `rb_${randomUUID()}`
      const latePaymentId = `pay_${randomUUID()}`
      const abandonedId = randomUUID()
      const activeId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        // The user re-joined and is active via a different checkout.
        await tx.insert(schema.memberSubscriptions).values({
          id: activeId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: activeRecurringId,
          hitpayPaymentId: `pay_${randomUUID()}`,
        })
        // The earlier abandoned checkout — expired, never paid.
        await tx.insert(schema.memberSubscriptions).values({
          id: abandonedId,
          userId: buyerId,
          status: "expired",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: abandonedRecurringId,
        })
      })

      const res = await webhookInject(app, {
        recurring_billing_id: abandonedRecurringId,
        payment_id: latePaymentId,
        status: "succeeded",
        amount: "75.00",
      })
      expect(res.statusCode).toBe(200)

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.userId, buyerId)),
      )
      // No third row inserted; still exactly one active membership.
      expect(rows).toHaveLength(2)
      const active = rows.filter((r) => r.status === "active")
      expect(active).toHaveLength(1)
      expect(active[0]?.id).toBe(activeId)
      // The abandoned row records the late payment id for reconciliation/refund.
      const abandoned = rows.find((r) => r.id === abandonedId)
      expect(abandoned?.status).toBe("expired")
      expect(abandoned?.hitpayPaymentId).toBe(latePaymentId)
      // No revenue ledger credit for the double charge — refund handled by ops.
      const ledger = await withAdmin(
        setupDb.db,
        { userId: buyerId, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.ledgerEntries)
            .where(eq(schema.ledgerEntries.referenceId, abandonedId)),
      )
      expect(ledger).toHaveLength(0)
    })
  })

  // ── brand subscription ─────────────────────────────────────────────────────

  describe("brand subscription payment (payment_request_id present)", () => {
    it("activates brand_subscription and writes 3 ledger legs on completed payment", async () => {
      const ownerId = await seedUser("seller_owner")
      const buyerId = await seedUser()
      const storeId = await seedStore(ownerId)
      const planId = await seedBrandPlan(storeId)

      const paymentRequestId = `pr_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setMonth(periodEnd.getMonth() + 3)
      const priceSen = 50000n

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptions).values({
          id: subId,
          userId: buyerId,
          storeId,
          planId,
          status: "pending",
          priceMyrSen: priceSen,
          discountPct: 5,
          periodStart: now,
          periodEnd,
          hitpayPaymentRequestId: paymentRequestId,
          bomyCommissionSen: 0n,
          brandPayoutSen: 0n,
        })
      })

      // fees = 1.50 → 150 sen; net = 49850; brand = 44865; bomy = 4985; sum = 50000
      const res = await webhookInject(app, {
        payment_request_id: paymentRequestId,
        payment_id: paymentId,
        status: "completed",
        amount: "500.00",
        fees: "1.50",
      })

      expect(res.statusCode).toBe(200)

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId)),
      )
      const sub = rows[0]
      expect(sub?.status).toBe("active")
      expect(sub?.hitpayPaymentId).toBe(paymentId)
      expect(sub?.hitpayFeeSen).toBe(150n)

      const total = sub!.bomyCommissionSen + sub!.brandPayoutSen + sub!.hitpayFeeSen!
      expect(total).toBe(priceSen)

      const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.referenceId, subId)),
      )
      expect(legs).toHaveLength(3)

      const byDirection = {
        credit: legs.filter((l) => l.direction === "credit"),
        debit: legs.filter((l) => l.direction === "debit"),
      }
      expect(byDirection.credit).toHaveLength(1)
      expect(byDirection.debit).toHaveLength(2)
      expect(byDirection.credit[0]?.amountMinor).toBe(priceSen)
      expect(byDirection.credit[0]?.revenueSource).toBe("brand_subscription")

      const feeDebit = legs.find((l) => l.revenueSource === "processing_fee")
      expect(feeDebit?.amountMinor).toBe(150n)
    })

    it("is idempotent — already-active subscription skips all writes", async () => {
      const ownerId = await seedUser("seller_owner")
      const buyerId = await seedUser()
      const storeId = await seedStore(ownerId)
      const planId = await seedBrandPlan(storeId)

      const paymentRequestId = `pr_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const priceSen = 50000n
      const feeSen = 150n
      const netSen = priceSen - feeSen
      const brandPayoutSen = (netSen * 90n) / 100n
      const bomyCommissionSen = netSen - brandPayoutSen

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptions).values({
          id: subId,
          userId: buyerId,
          storeId,
          planId,
          status: "active",
          priceMyrSen: priceSen,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          hitpayPaymentRequestId: paymentRequestId,
          hitpayPaymentId: paymentId,
          hitpayFeeSen: feeSen,
          bomyCommissionSen,
          brandPayoutSen,
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

      const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.referenceId, subId)),
      )
      expect(legs).toHaveLength(0)
    })

    it("does NOT reactivate an expired (abandoned-then-expired) subscription on a late payment, and writes no ledger", async () => {
      const ownerId = await seedUser("seller_owner")
      const buyerId = await seedUser()
      const storeId = await seedStore(ownerId)
      const planId = await seedBrandPlan(storeId)

      const paymentRequestId = `pr_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const priceSen = 50000n

      // Abandoned pending that the re-subscribe action already expired
      // (status='expired', never paid → hitpay_payment_id null).
      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptions).values({
          id: subId,
          userId: buyerId,
          storeId,
          planId,
          status: "expired",
          priceMyrSen: priceSen,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
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

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId)),
      )
      expect(rows[0]?.status).toBe("expired") // NOT reactivated
      expect(rows[0]?.hitpayPaymentId).toBeNull()

      const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.referenceId, subId)),
      )
      expect(legs).toHaveLength(0)
    })

    it("sets status = payment_failed on failed payment", async () => {
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
          status: "pending",
          priceMyrSen: 50000n,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          hitpayPaymentRequestId: paymentRequestId,
          bomyCommissionSen: 0n,
          brandPayoutSen: 0n,
        })
      })

      await webhookInject(app, {
        payment_request_id: paymentRequestId,
        payment_id: paymentId,
        status: "failed",
        amount: "500.00",
        fees: "0.00",
      })

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId)),
      )
      expect(rows[0]?.status).toBe("payment_failed")
    })

    it("zero-fee activation writes only 2 ledger legs (no processing_fee leg)", async () => {
      const ownerId = await seedUser("seller_owner")
      const buyerId = await seedUser()
      const storeId = await seedStore(ownerId)
      const planId = await seedBrandPlan(storeId)

      const paymentRequestId = `pr_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const priceSen = 50000n

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptions).values({
          id: subId,
          userId: buyerId,
          storeId,
          planId,
          status: "pending",
          priceMyrSen: priceSen,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
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
        fees: "0.00",
      })
      expect(res.statusCode).toBe(200)

      const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.referenceId, subId)),
      )
      // Only credit + payout debit; no processing_fee debit when feeSen = 0.
      expect(legs).toHaveLength(2)
      expect(legs.every((l) => l.amountMinor > 0n)).toBe(true)
    })

    it("aborts activation when webhook amount does not match price", async () => {
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
          status: "pending",
          priceMyrSen: 50000n,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          hitpayPaymentRequestId: paymentRequestId,
          bomyCommissionSen: 0n,
          brandPayoutSen: 0n,
        })
      })

      // Wrong amount: "450.00" (45000 sen) instead of "500.00" (50000 sen).
      await webhookInject(app, {
        payment_request_id: paymentRequestId,
        payment_id: paymentId,
        status: "completed",
        amount: "450.00",
        fees: "1.50",
      })

      const rows = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx.select().from(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId)),
      )
      // Row must still be pending — activation aborted.
      expect(rows[0]?.status).toBe("pending")
    })
  })

  // ── refund (charge.updated) ────────────────────────────────────────────────

  describe("refund (charge.updated)", () => {
    it("records a debit ledger entry for a membership refund", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
          hitpayPaymentId: paymentId,
        })
      })

      const res = await webhookInject(
        app,
        {
          payment_id: paymentId,
          refund_amount: "75.00",
          status: "refunded",
        },
        { "hitpay-event-type": "charge.updated" },
      )
      expect(res.statusCode).toBe(200)

      const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.ledgerEntries)
          .where(
            and(
              eq(schema.ledgerEntries.referenceId, subId),
              eq(schema.ledgerEntries.revenueSource, "refund"),
            ),
          ),
      )
      expect(legs).toHaveLength(1)
      expect(legs[0]?.direction).toBe("debit")
      expect(legs[0]?.amountMinor).toBe(7500n)
    })

    it("refund is idempotent — second charge.updated does not insert a duplicate", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
          hitpayPaymentId: paymentId,
        })
      })

      const payload = { payment_id: paymentId, refund_amount: "75.00", status: "refunded" }
      const headers = { "hitpay-event-type": "charge.updated" }

      await webhookInject(app, payload, headers)
      const res2 = await webhookInject(app, payload, headers)
      expect(res2.statusCode).toBe(200)

      const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.ledgerEntries)
          .where(
            and(
              eq(schema.ledgerEntries.referenceId, subId),
              eq(schema.ledgerEntries.revenueSource, "refund"),
            ),
          ),
      )
      expect(legs).toHaveLength(1)
    })

    it("charge.updated without refund_amount creates no ledger entry", async () => {
      const buyerId = await seedUser()
      const recurringId = `rb_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const subId = randomUUID()
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      await withAdmin(setupDb.db, { userId: buyerId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId: buyerId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: now,
          periodEnd,
          hitpayRecurringId: recurringId,
          hitpayPaymentId: paymentId,
        })
      })

      // charge.updated with amount but no refund_amount — non-refund update.
      const res = await webhookInject(
        app,
        { payment_id: paymentId, amount: "75.00", status: "updated" },
        { "hitpay-event-type": "charge.updated" },
      )
      expect(res.statusCode).toBe(200)

      const legs = await withAdmin(setupDb.db, { userId: buyerId, reason: "verify" }, async (tx) =>
        tx
          .select()
          .from(schema.ledgerEntries)
          .where(
            and(
              eq(schema.ledgerEntries.referenceId, subId),
              eq(schema.ledgerEntries.revenueSource, "refund"),
            ),
          ),
      )
      expect(legs).toHaveLength(0)
    })
  })

  // ── routing — order dispatcher (tests 11–13, 36–38) ───────────────────────

  describe("routing — order dispatcher (tests 11–13, 36–38)", () => {
    // Seeds a minimal but fan-out-valid checkout: session + one store row +
    // one item + one active reservation. Fan-out will produce exactly one
    // order and one converted reservation, satisfying the consistency check
    // on idempotency replay. If storeId is supplied (Tests 11/36) the product
    // and variant are created under it; otherwise a fresh seller + store are
    // created internally (Test 13).
    async function seedCheckoutSession(
      paymentRequestId: string,
      buyerId: string,
      opts: { storeId?: string } = {},
    ): Promise<{ sessionId: string; storeId: string; variantId: string }> {
      const sessionId = randomUUID()
      const productId = randomUUID()
      const variantId = randomUUID()
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

      const resolvedStoreId = opts.storeId ?? randomUUID()

      await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
        if (!opts.storeId) {
          const sellerId = randomUUID()
          await tx.insert(schema.users).values({
            id: sellerId,
            email: `${sellerId}@test.bomy`,
            role: "seller_owner",
          })
          await tx.insert(schema.stores).values({
            id: resolvedStoreId,
            ownerId: sellerId,
            name: "Routing Store",
            slug: `routing-${resolvedStoreId}`,
            status: "active",
          })
        }
        await tx.insert(schema.products).values({
          id: productId,
          storeId: resolvedStoreId,
          name: "Routing Product",
          slug: `routing-${productId}`,
          status: "active",
        })
        await tx.insert(schema.productVariants).values({
          id: variantId,
          productId,
          name: "V",
          priceMyrSen: 5000n,
          stockCount: 100,
          isActive: true,
        })
        await tx.insert(schema.checkoutSessions).values({
          id: sessionId,
          userId: buyerId,
          shippingAddress: {
            name: "Test",
            line1: "1 Test St",
            city: "KL",
            state: "WP",
            postcode: "50000",
            country: "MY",
          },
          totalCatalogSen: 5000n,
          totalShippingSen: 0n,
          totalBuyerPaysSen: 5000n,
          pspPaymentRequestId: paymentRequestId,
          expiresAt,
        })
        await tx.insert(schema.checkoutSessionStores).values({
          checkoutSessionId: sessionId,
          storeId: resolvedStoreId,
          retailSubtotalSen: 5000n,
          brandDiscountSen: 0n,
          discountedSubtotalSen: 5000n,
          voucherContributionSen: 0n,
          shippingFeeSen: 0n,
        })
        await tx.insert(schema.checkoutSessionItems).values({
          checkoutSessionId: sessionId,
          storeId: resolvedStoreId,
          variantId,
          productSnapshot: { id: productId, name: "Routing Product" },
          variantSnapshot: { id: variantId, name: "V" },
          quantity: 1,
          unitPriceSen: 5000n,
          lineTotalSen: 5000n,
        })
        await tx.insert(schema.inventoryReservations).values({
          checkoutSessionId: sessionId,
          variantId,
          quantity: 1,
          status: "active",
          expiresAt,
        })
      })

      return { sessionId, storeId: resolvedStoreId, variantId }
    }

    async function readOrders(sessionId: string) {
      return withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, async (tx) =>
        tx.select().from(schema.orders).where(eq(schema.orders.checkoutSessionId, sessionId)),
      )
    }

    it("11 — payment_request_id matching checkout_session routes to order handler, not brand-sub", async () => {
      const buyerId = await seedUser()
      const sellerId = await seedUser("seller_owner")
      const storeId = await seedStore(sellerId)
      const planId = await seedBrandPlan(storeId)
      const paymentRequestId = `pr_${randomUUID()}`
      const { sessionId } = await seedCheckoutSession(paymentRequestId, buyerId, { storeId })

      // Seed brand_sub with same paymentRequestId — must NOT be activated
      const brandSubId = randomUUID()
      const now = new Date()
      await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptions).values({
          id: brandSubId,
          userId: buyerId,
          storeId,
          planId,
          status: "pending",
          priceMyrSen: 5000n,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          hitpayPaymentRequestId: paymentRequestId,
          bomyCommissionSen: 0n,
          brandPayoutSen: 0n,
        })
      })

      const eventId = `evt_${randomUUID()}`
      const res = await webhookInject(
        app,
        {
          payment_request_id: paymentRequestId,
          payment_id: `pay_${randomUUID()}`,
          status: "completed",
          amount: "50.00",
          fees: "0.95",
        },
        { "hitpay-event-type": "payment_request.completed", "hitpay-event-id": eventId },
      )
      expect(res.statusCode).toBe(200)

      // Order handler claimed idempotency
      const events = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.processedWebhookEvents)
            .where(eq(schema.processedWebhookEvents.pspEventId, eventId)),
      )
      expect(events).toHaveLength(1)

      // Fan-out created exactly 1 order
      expect(await readOrders(sessionId)).toHaveLength(1)

      // Brand-sub handler was NOT invoked — sub remains pending
      const sub = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.brandSubscriptions)
            .where(eq(schema.brandSubscriptions.id, brandSubId)),
      )
      expect(sub[0]?.status).toBe("pending")
    })

    it("12 — payment_request_id matching only brand_sub falls through to brand-sub handler", async () => {
      const ownerId = await seedUser("seller_owner")
      const buyerId = await seedUser()
      const storeId = await seedStore(ownerId)
      const planId = await seedBrandPlan(storeId)
      const paymentRequestId = `pr_${randomUUID()}`
      const paymentId = `pay_${randomUUID()}`
      const brandSubId = randomUUID()
      const now = new Date()

      await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptions).values({
          id: brandSubId,
          userId: buyerId,
          storeId,
          planId,
          status: "pending",
          priceMyrSen: 50000n,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          hitpayPaymentRequestId: paymentRequestId,
          bomyCommissionSen: 0n,
          brandPayoutSen: 0n,
        })
      })

      // No checkout_session for this paymentRequestId → order handler returns "not_order"
      // → falls through to brand-sub handler → activates
      const res = await webhookInject(
        app,
        {
          payment_request_id: paymentRequestId,
          payment_id: paymentId,
          status: "completed",
          amount: "500.00",
          fees: "1.50",
        },
        {
          "hitpay-event-type": "payment_request.completed",
          "hitpay-event-id": `evt_${randomUUID()}`,
        },
      )
      expect(res.statusCode).toBe(200)

      const sub = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.brandSubscriptions)
            .where(eq(schema.brandSubscriptions.id, brandSubId)),
      )
      expect(sub[0]?.status).toBe("active")
    })

    it("13 — missing Hitpay-Event-Id uses derived:SHA256(body); same body is idempotent", async () => {
      const buyerId = await seedUser()
      const paymentRequestId = `pr_${randomUUID()}`
      const { sessionId } = await seedCheckoutSession(paymentRequestId, buyerId)

      const bodyObj = {
        payment_request_id: paymentRequestId,
        payment_id: `pay_${randomUUID()}`,
        status: "completed",
        amount: "50.00",
        fees: "0.95",
      }
      const rawBody = JSON.stringify(bodyObj)
      const signature = makeSignature(rawBody)
      const expectedEventId = `derived:${createHash("sha256").update(rawBody).digest("hex")}`
      const headers = {
        "content-type": "application/json",
        "hitpay-signature": signature,
        "hitpay-event-type": "payment_request.completed",
        // No hitpay-event-id — tests the fallback path
      }

      const res1 = await app.inject({
        method: "POST",
        url: "/webhooks/hitpay",
        headers,
        body: rawBody,
      })
      expect(res1.statusCode).toBe(200)

      const events1 = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.processedWebhookEvents)
            .where(eq(schema.processedWebhookEvents.pspEventId, expectedEventId)),
      )
      expect(events1).toHaveLength(1)
      expect(events1[0]?.pspEventId).toMatch(/^derived:/)

      // Fan-out created exactly 1 order on first delivery
      expect(await readOrders(sessionId)).toHaveLength(1)

      // Replay identical body → idempotency hit; consistency check must pass (paid session, 1 order, converted reservation)
      const res2 = await app.inject({
        method: "POST",
        url: "/webhooks/hitpay",
        headers,
        body: rawBody,
      })
      expect(res2.statusCode).toBe(200)

      const events2 = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.processedWebhookEvents)
            .where(eq(schema.processedWebhookEvents.pspEventId, expectedEventId)),
      )
      expect(events2).toHaveLength(1)
      // No duplicate fan-out — order count unchanged
      expect(await readOrders(sessionId)).toHaveLength(1)
    })

    it("36 — order handler 'handled' suppresses brand-sub invocation (§3.1 regression)", async () => {
      const buyerId = await seedUser()
      const sellerId = await seedUser("seller_owner")
      const storeId = await seedStore(sellerId)
      const planId = await seedBrandPlan(storeId)
      const paymentRequestId = `pr_${randomUUID()}`
      const { sessionId } = await seedCheckoutSession(paymentRequestId, buyerId, { storeId })

      const brandSubId = randomUUID()
      const now = new Date()
      await withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.brandSubscriptions).values({
          id: brandSubId,
          userId: buyerId,
          storeId,
          planId,
          status: "pending",
          priceMyrSen: 5000n,
          discountPct: 5,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          hitpayPaymentRequestId: paymentRequestId,
          bomyCommissionSen: 0n,
          brandPayoutSen: 0n,
        })
      })

      await webhookInject(
        app,
        {
          payment_request_id: paymentRequestId,
          payment_id: `pay_${randomUUID()}`,
          status: "completed",
          amount: "50.00",
          fees: "0.95",
        },
        {
          "hitpay-event-type": "payment_request.completed",
          "hitpay-event-id": `evt_${randomUUID()}`,
        },
      )

      // Fan-out ran for the order path — exactly 1 order created
      expect(await readOrders(sessionId)).toHaveLength(1)

      // Brand-sub handler was NOT invoked — sub remains pending
      const sub = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.brandSubscriptions)
            .where(eq(schema.brandSubscriptions.id, brandSubId)),
      )
      expect(sub[0]?.status).toBe("pending")
    })

    it("37 — charge.updated header routes to refund handler before order dispatcher; no crash", async () => {
      const paymentId = `pay_${randomUUID()}`
      const res = await webhookInject(
        app,
        { payment_id: paymentId, refund_amount: "10.00", status: "refunded" },
        { "hitpay-event-type": "charge.updated" },
      )
      expect(res.statusCode).toBe(200)

      // Refund handler does not write processed_webhook_events
      const events = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.processedWebhookEvents)
            .where(eq(schema.processedWebhookEvents.pspEventId, paymentId)),
      )
      expect(events).toHaveLength(0)
    })

    it("fire-and-forget: returns 200 without awaiting SMTP", async () => {
      const buyerId = await seedUser("buyer")
      const sellerId = await seedUser("seller_owner")
      const storeId = await seedStore(sellerId)
      const prId = randomUUID()
      const sessionId = randomUUID()

      await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "fire-forget test seed" },
        async (tx) => {
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
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
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

      let resolveSendMail!: () => void
      const sendMailBlocked = new Promise<void>((resolve) => {
        resolveSendMail = resolve
      })

      const sendMailSpy = vi.spyOn(app.mailer, "sendMail").mockImplementation(async () => {
        await sendMailBlocked
      })

      const res = await webhookInject(
        app,
        {
          payment_request_id: prId,
          payment_id: `pay-${randomUUID()}`,
          status: "completed",
          amount: "10.00",
          fees: "0.30",
        },
        { "hitpay-event-type": "payment_request.completed" },
      )

      // Route returns 200 before SMTP settles.
      expect(res.statusCode).toBe(200)

      // Unblock sendMail and give the event loop time to settle.
      resolveSendMail()
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
      expect(sendMailSpy).toHaveBeenCalled()

      sendMailSpy.mockRestore()
    })

    it("38 — bad signature on order-shaped event → 401; no idempotency row; session unchanged", async () => {
      const buyerId = await seedUser()
      const paymentRequestId = `pr_${randomUUID()}`
      const { sessionId } = await seedCheckoutSession(paymentRequestId, buyerId)
      const eventId = `evt_${randomUUID()}`

      const res = await app.inject({
        method: "POST",
        url: "/webhooks/hitpay",
        headers: {
          "content-type": "application/json",
          "hitpay-signature": "deadbeef",
          "hitpay-event-type": "payment_request.completed",
          "hitpay-event-id": eventId,
        },
        body: JSON.stringify({
          payment_request_id: paymentRequestId,
          payment_id: `pay_${randomUUID()}`,
          status: "completed",
          amount: "50.00",
          fees: "0.95",
        }),
      })
      expect(res.statusCode).toBe(401)

      const events = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.processedWebhookEvents)
            .where(eq(schema.processedWebhookEvents.pspEventId, eventId)),
      )
      expect(events).toHaveLength(0)

      const session = await withAdmin(
        setupDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx
            .select()
            .from(schema.checkoutSessions)
            .where(eq(schema.checkoutSessions.id, sessionId)),
      )
      expect(session[0]?.status).toBe("pending_payment")
    })
  })
})
