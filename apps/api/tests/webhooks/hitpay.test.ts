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
import { createHmac, randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../../src/server.js"

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
    await withAdmin(setupDb.db, { userId: id, reason: "test seed" }, async (tx) => {
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
    await withAdmin(setupDb.db, { userId: actorId, reason: "test seed" }, async (tx) => {
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
  })
})
