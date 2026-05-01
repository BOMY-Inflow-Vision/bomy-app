import { randomUUID } from "node:crypto"

import { schema, withAdmin } from "@bomy/db"
import { verifyWebhookSignature } from "@bomy/hitpay"
import { eq } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"

// Sentinel UUID used as the "actor" for system-level writes that have no
// associated user session (webhook callbacks from HitPay).
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

function parseSen(amount: string): bigint {
  return BigInt(Math.round(parseFloat(amount) * 100))
}

export const hitpayWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Capture the raw form-encoded body as a string so HMAC verification can
  // reconstruct the sorted-field message. Must be registered before routes.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body)
    },
  )

  app.post<{ Body: string }>("/webhooks/hitpay", async (request, reply) => {
    const rawBody = request.body
    const salt = process.env["HITPAY_SALT"] ?? ""

    const params = new URLSearchParams(rawBody)
    const hmac = params.get("hmac") ?? ""

    // 1. Verify HMAC — reject early; do not return 4xx details that could
    //    aid an attacker in crafting valid signatures.
    if (!verifyWebhookSignature(rawBody, hmac, salt)) {
      request.log.warn({ path: "/webhooks/hitpay" }, "webhook signature invalid")
      return reply.status(401).send({ error: "invalid signature" })
    }

    const paymentId = params.get("payment_id") ?? ""
    const status = params.get("status") ?? ""
    const amountStr = params.get("amount") ?? "0"
    const feesStr = params.get("fees") ?? "0"
    const recurringBillingId = params.get("recurring_billing_id")
    const paymentRequestId = params.get("payment_request_id")

    // 2. Route by payload shape — HitPay form webhooks have no explicit
    //    event_type field; we infer from which reference ID is present.
    if (recurringBillingId) {
      await handleMembershipCharge({ app, recurringBillingId, paymentId, status, amountStr })
    } else if (paymentRequestId) {
      await handleBrandSubscriptionPayment({
        app,
        paymentRequestId,
        paymentId,
        status,
        feesStr,
      })
    } else {
      request.log.warn({ paymentId, status }, "hitpay webhook: unrecognised payload shape")
    }

    // Always 200 — prevents HitPay from retrying on slow DB writes.
    return reply.status(200).send({ received: true })
  })
}

// ─── Platform membership (recurring billing) ──────────────────────────────────

interface MembershipArgs {
  app: Parameters<FastifyPluginAsync>[0]
  recurringBillingId: string
  paymentId: string
  status: string
  amountStr: string
}

async function handleMembershipCharge({
  app,
  recurringBillingId,
  paymentId,
  status,
  amountStr,
}: MembershipArgs): Promise<void> {
  await withAdmin(
    app.db.db,
    { userId: SYSTEM_ACTOR, reason: "hitpay webhook: membership charge" },
    async (tx) => {
      const rows = await tx
        .select()
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.hitpayRecurringId, recurringBillingId))
        .limit(1)

      const sub = rows[0]
      if (!sub) {
        app.log.warn(
          { recurringBillingId },
          "hitpay webhook: no member_subscription found for recurring id",
        )
        return
      }

      // Idempotency — same paymentId already processed.
      if (sub.hitpayPaymentId === paymentId) {
        app.log.info({ paymentId }, "hitpay webhook: membership charge already processed")
        return
      }

      if (status === "succeeded" || status === "active") {
        const now = new Date()

        if (sub.status === "pending") {
          // First activation: update the existing pending row in place.
          // period_start and period_end were set by the web action at checkout.
          await tx
            .update(schema.memberSubscriptions)
            .set({ status: "active", hitpayPaymentId: paymentId, updatedAt: now })
            .where(eq(schema.memberSubscriptions.id, sub.id))
        } else {
          // Renewal: insert a new subscription row for the next period.
          // The old row keeps its own period_end; renewals are immutable rows.
          const periodStart = sub.periodEnd
          const periodEnd = new Date(periodStart)
          periodEnd.setFullYear(periodEnd.getFullYear() + 1)

          await tx.insert(schema.memberSubscriptions).values({
            id: randomUUID(),
            userId: sub.userId,
            status: "active",
            priceMyrSen: sub.priceMyrSen,
            hitpayRecurringId: recurringBillingId,
            hitpayPaymentId: paymentId,
            periodStart,
            periodEnd,
          })
        }

        // Ledger: one credit leg per charge.
        const txnId = randomUUID()
        await tx.insert(schema.ledgerEntries).values({
          transactionId: txnId,
          idempotencyKey: `membership:recurring:${paymentId}:credit`,
          direction: "credit",
          account: "revenue:platform_subscription",
          amountMinor: parseSen(amountStr),
          currency: "MYR",
          revenueSource: "platform_subscription",
          referenceId: sub.id,
          referenceType: "member_subscription",
        })

        app.log.info(
          { subscriptionId: sub.id, paymentId },
          "hitpay webhook: membership charge processed",
        )
        return
      }

      // Failed or cancelled — update status on the existing row.
      if (status === "failed" || status === "cancelled") {
        const now = new Date()
        await tx
          .update(schema.memberSubscriptions)
          .set({
            status: status === "cancelled" ? "cancelled" : "payment_failed",
            hitpayPaymentId: paymentId,
            ...(status === "cancelled" ? { cancelledAt: now } : {}),
            updatedAt: now,
          })
          .where(eq(schema.memberSubscriptions.id, sub.id))

        app.log.info(
          { subscriptionId: sub.id, status },
          "hitpay webhook: membership status updated",
        )
      }
    },
  )
}

// ─── Brand subscription (payment request / one-time) ─────────────────────────

interface BrandSubArgs {
  app: Parameters<FastifyPluginAsync>[0]
  paymentRequestId: string
  paymentId: string
  status: string
  feesStr: string
}

async function handleBrandSubscriptionPayment({
  app,
  paymentRequestId,
  paymentId,
  status,
  feesStr,
}: BrandSubArgs): Promise<void> {
  await withAdmin(
    app.db.db,
    { userId: SYSTEM_ACTOR, reason: "hitpay webhook: brand subscription payment" },
    async (tx) => {
      // The web action (PR #21) stores the payment_request_id in hitpay_payment_id
      // on the pending row so we can find it here.
      const rows = await tx
        .select()
        .from(schema.brandSubscriptions)
        .where(eq(schema.brandSubscriptions.hitpayPaymentId, paymentRequestId))
        .limit(1)

      const sub = rows[0]
      if (!sub) {
        app.log.warn(
          { paymentRequestId },
          "hitpay webhook: no brand_subscription found for payment request",
        )
        return
      }

      // Idempotency — already activated.
      if (sub.status === "active") {
        app.log.info({ paymentRequestId }, "hitpay webhook: brand subscription already active")
        return
      }

      if (status === "completed" || status === "succeeded") {
        const priceSen = sub.priceMyrSen
        const feeSen = parseSen(feesStr)
        const netSen = priceSen - feeSen

        // Net-of-fees commission split (locked 2026-05-01).
        // Integer truncation: brand gets floor(net × 90%), BOMY gets the rest.
        const brandPayoutSen = (netSen * 90n) / 100n
        const bomyCommissionSen = netSen - brandPayoutSen

        if (bomyCommissionSen + brandPayoutSen + feeSen !== priceSen) {
          app.log.error(
            { priceSen, feeSen, netSen, brandPayoutSen, bomyCommissionSen },
            "hitpay webhook: brand sub split does not balance — aborting activation",
          )
          return
        }

        const now = new Date()

        await tx
          .update(schema.brandSubscriptions)
          .set({
            status: "active",
            hitpayPaymentId: paymentId,
            hitpayFeeSen: feeSen,
            bomyCommissionSen,
            brandPayoutSen,
            updatedAt: now,
          })
          .where(eq(schema.brandSubscriptions.id, sub.id))

        // Ledger: 3 legs per spec §3.4
        // credit +price (revenue received)
        // debit  −payout (owed to brand)
        // debit  −fee (cost of HitPay processing)
        const txnId = randomUUID()
        await tx.insert(schema.ledgerEntries).values([
          {
            transactionId: txnId,
            idempotencyKey: `brand_sub:${sub.id}:${paymentId}:credit`,
            direction: "credit",
            account: "revenue:brand_subscription",
            amountMinor: priceSen,
            currency: "MYR",
            revenueSource: "brand_subscription",
            referenceId: sub.id,
            referenceType: "brand_subscription",
          },
          {
            transactionId: txnId,
            idempotencyKey: `brand_sub:${sub.id}:${paymentId}:debit:payout`,
            direction: "debit",
            account: "payable:brand_payout",
            amountMinor: brandPayoutSen,
            currency: "MYR",
            revenueSource: "brand_subscription",
            referenceId: sub.id,
            referenceType: "brand_subscription",
          },
          {
            transactionId: txnId,
            idempotencyKey: `brand_sub:${sub.id}:${paymentId}:debit:fee`,
            direction: "debit",
            account: "expense:processing_fee",
            amountMinor: feeSen,
            currency: "MYR",
            revenueSource: "processing_fee",
            referenceId: sub.id,
            referenceType: "brand_subscription",
          },
        ])

        app.log.info(
          { subscriptionId: sub.id, paymentId, brandPayoutSen, bomyCommissionSen, feeSen },
          "hitpay webhook: brand subscription activated",
        )
        return
      }

      if (status === "failed") {
        await tx
          .update(schema.brandSubscriptions)
          .set({ status: "payment_failed", updatedAt: new Date() })
          .where(eq(schema.brandSubscriptions.id, sub.id))

        app.log.info(
          { subscriptionId: sub.id },
          "hitpay webhook: brand subscription payment failed",
        )
      }
    },
  )
}
