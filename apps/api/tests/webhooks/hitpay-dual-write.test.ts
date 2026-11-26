/**
 * Integration tests — HitPay webhook dual-write (Stripe design §4.1, PR 2).
 *
 * Every id the HitPay webhook stores must land in BOTH the legacy hitpay_* column (correlation
 * still reads it) and the provider-neutral psp_* column (shared readers now read it). Fixtures
 * are seeded the way pre-PR-2 code wrote them (hitpay_* only), so each test also proves a
 * deploy-window row is completed by the next webhook.
 *
 * Same harness and gating as hitpay.test.ts.
 */
import { createHmac, randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../../src/server.js"
import { nextTestClientIp } from "../helpers/client-ip.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const TEST_SALT = "test-webhook-salt"

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
      "hitpay-signature": createHmac("sha256", TEST_SALT).update(body).digest("hex"),
      "x-forwarded-for": nextTestClientIp(),
      ...extraHeaders,
    },
    body,
  })
}

describe.skipIf(!shouldRun)("POST /webhooks/hitpay — hitpay_* + psp_* dual-write", () => {
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

  const admin = <T>(fn: Parameters<typeof withAdmin<T>>[2]) =>
    withAdmin(setupDb.db, { userId: SYSTEM_ACTOR, reason: "test dual-write" }, fn)

  async function seedUser(role: "buyer" | "seller_owner" = "buyer") {
    const id = randomUUID()
    await admin(async (tx) => {
      await tx.insert(schema.users).values({ id, email: `${id}@test.bomy`, role })
    })
    return id
  }

  function yearFrom(d: Date) {
    const end = new Date(d)
    end.setFullYear(end.getFullYear() + 1)
    return end
  }

  it("membership activation writes hitpay_payment_id and psp_payment_id", async () => {
    const buyerId = await seedUser()
    const recurringId = `rb_${randomUUID()}`
    const paymentId = `pay_${randomUUID()}`
    const subId = randomUUID()
    const now = new Date()
    await admin(async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId: buyerId,
        status: "pending",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: yearFrom(now),
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

    const [row] = await admin((tx) =>
      tx.select().from(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId)),
    )
    expect(row?.status).toBe("active")
    expect(row?.hitpayPaymentId).toBe(paymentId)
    expect(row?.pspPaymentId).toBe(paymentId)
    expect(row?.pspProvider).toBe("hitpay")
  })

  it("membership renewal row carries psp_provider, psp_recurring_id and psp_payment_id", async () => {
    const buyerId = await seedUser()
    const recurringId = `rb_${randomUUID()}`
    const renewalPaymentId = `pay_${randomUUID()}`
    const now = new Date()
    await admin(async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        userId: buyerId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: yearFrom(now),
        hitpayRecurringId: recurringId,
        hitpayPaymentId: `pay_${randomUUID()}`,
      })
    })

    const res = await webhookInject(app, {
      recurring_billing_id: recurringId,
      payment_id: renewalPaymentId,
      status: "succeeded",
      amount: "75.00",
    })
    expect(res.statusCode).toBe(200)

    const [renewal] = await admin((tx) =>
      tx
        .select()
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.hitpayPaymentId, renewalPaymentId)),
    )
    expect(renewal?.status).toBe("active")
    expect(renewal?.pspProvider).toBe("hitpay")
    expect(renewal?.hitpayRecurringId).toBe(recurringId)
    expect(renewal?.pspRecurringId).toBe(recurringId)
    expect(renewal?.pspPaymentId).toBe(renewalPaymentId)

    // The ledger key is unchanged (legacy, unprefixed HitPay format).
    const ledger = await admin((tx) =>
      tx
        .select()
        .from(schema.ledgerEntries)
        .where(
          eq(
            schema.ledgerEntries.idempotencyKey,
            `membership:recurring:${renewalPaymentId}:credit`,
          ),
        ),
    )
    expect(ledger).toHaveLength(1)
  })

  it("brand activation writes both payment-id and both fee columns (fee-sync CHECK holds)", async () => {
    const ownerId = await seedUser("seller_owner")
    const buyerId = await seedUser()
    const storeId = randomUUID()
    const planId = randomUUID()
    const subId = randomUUID()
    const paymentRequestId = `pr_${randomUUID()}`
    const paymentId = `pay_${randomUUID()}`
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 3)
    await admin(async (tx) => {
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId,
        name: "Dual-write store",
        slug: `store-${storeId}`,
        status: "active",
      })
      await tx.insert(schema.brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 50000n,
        discountPct: 5,
        isActive: true,
      })
      await tx.insert(schema.brandSubscriptions).values({
        id: subId,
        userId: buyerId,
        storeId,
        planId,
        status: "pending",
        priceMyrSen: 50000n,
        discountPct: 5,
        periodStart: now,
        periodEnd,
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

    const [sub] = await admin((tx) =>
      tx.select().from(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId)),
    )
    expect(sub?.status).toBe("active")
    expect(sub?.hitpayPaymentId).toBe(paymentId)
    expect(sub?.pspPaymentId).toBe(paymentId)
    expect(sub?.hitpayFeeSen).toBe(150n)
    expect(sub?.pspFeeSen).toBe(150n)
    expect(sub!.bomyCommissionSen + sub!.brandPayoutSen + sub!.pspFeeSen!).toBe(50000n)

    const feeLeg = await admin((tx) =>
      tx
        .select()
        .from(schema.ledgerEntries)
        .where(
          eq(schema.ledgerEntries.idempotencyKey, `brand_sub:${subId}:${paymentId}:debit:fee`),
        ),
    )
    expect(feeLeg).toHaveLength(1)
  })

  it("membership duplicate charge: stamped row and duplicate_charges row are dual-written", async () => {
    const buyerId = await seedUser()
    const abandonedRecurringId = `rb_${randomUUID()}`
    const paymentId = `pay_${randomUUID()}`
    const abandonedId = randomUUID()
    const now = new Date()
    await admin(async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        userId: buyerId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: yearFrom(now),
        hitpayRecurringId: `rb_${randomUUID()}`,
        hitpayPaymentId: `pay_${randomUUID()}`,
      })
      await tx.insert(schema.memberSubscriptions).values({
        id: abandonedId,
        userId: buyerId,
        status: "expired",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: yearFrom(now),
        hitpayRecurringId: abandonedRecurringId,
      })
    })

    const res = await webhookInject(app, {
      recurring_billing_id: abandonedRecurringId,
      payment_id: paymentId,
      status: "succeeded",
      amount: "75.00",
    })
    expect(res.statusCode).toBe(200)

    const [stamped] = await admin((tx) =>
      tx
        .select()
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.id, abandonedId)),
    )
    expect(stamped?.hitpayPaymentId).toBe(paymentId)
    expect(stamped?.pspPaymentId).toBe(paymentId)

    const dup = await admin((tx) =>
      tx
        .select()
        .from(schema.duplicateCharges)
        .where(eq(schema.duplicateCharges.hitpayPaymentId, paymentId)),
    )
    expect(dup).toHaveLength(1)
    expect(dup[0]?.pspProvider).toBe("hitpay")
    expect(dup[0]?.pspPaymentId).toBe(paymentId)

    // Re-delivery stays one row (conflict target hitpay_payment_id; the psp unique index agrees).
    const again = await webhookInject(app, {
      recurring_billing_id: abandonedRecurringId,
      payment_id: paymentId,
      status: "succeeded",
      amount: "75.00",
    })
    expect(again.statusCode).toBe(200)
    const dupAfter = await admin((tx) =>
      tx
        .select()
        .from(schema.duplicateCharges)
        .where(eq(schema.duplicateCharges.pspPaymentId, paymentId)),
    )
    expect(dupAfter).toHaveLength(1)
  })

  it.each([
    ["admin stored the refund id before dual-write (hitpay_refund_id only)", true],
    ["no refund id stored yet (taken from the webhook)", false],
  ])("duplicate refund webhook writes both refund-id columns — %s", async (_label, stored) => {
    const buyerId = await seedUser()
    const paymentId = `pay_${randomUUID()}`
    const refundId = `ref_${randomUUID()}`
    const dupId = await admin(async (tx) => {
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
          ...(stored ? { hitpayRefundId: refundId } : {}),
        })
        .returning({ id: schema.duplicateCharges.id })
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
    })

    const res = await webhookInject(
      app,
      { payment_id: paymentId, refund_amount: "500.00", refund_id: refundId, status: "refunded" },
      { "hitpay-event-type": "charge.updated" },
    )
    expect(res.statusCode).toBe(200)

    const [row] = await admin((tx) =>
      tx.select().from(schema.duplicateCharges).where(eq(schema.duplicateCharges.id, dupId)),
    )
    expect(row?.status).toBe("refunded")
    expect(row?.hitpayRefundId).toBe(refundId)
    expect(row?.pspRefundId).toBe(refundId)

    const debit = await admin((tx) =>
      tx
        .select()
        .from(schema.ledgerEntries)
        .where(
          eq(schema.ledgerEntries.idempotencyKey, `dup_charge:${paymentId}:${refundId}:debit`),
        ),
    )
    expect(debit).toHaveLength(1)
  })
})
