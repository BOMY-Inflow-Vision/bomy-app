import { randomUUID } from "node:crypto"

import { schema, withAdmin } from "@bomy/db"
import { verifyWebhookSignature } from "@bomy/hitpay"
import { eq } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"

// Sentinel UUID identifying the HitPay webhook system as the audit actor
// for all withAdmin writes. No user session exists for inbound webhooks.
// Future: define system principals in a dedicated table (ADR-08).
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

// Strict decimal-to-sen conversion. HitPay sends amounts as "N.NN" strings.
// parseFloat is explicitly avoided — a malformed string throws rather than
// silently producing a wrong bigint value.
function parseSen(amount: string): bigint {
  if (!/^\d+\.\d{2}$/.test(amount)) {
    throw new Error(`parseSen: invalid amount format "${amount}" — expected "N.NN"`)
  }
  const dotIdx = amount.indexOf(".")
  const whole = amount.slice(0, dotIdx)
  const cents = amount.slice(dotIdx + 1)
  return BigInt(whole) * 100n + BigInt(cents)
}

export const hitpayWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Fail at registration time — an empty salt means anyone can forge a
  // valid signature. Do not allow the app to start without this secret.
  const salt = process.env["HITPAY_SALT"]
  if (!salt) throw new Error("HITPAY_SALT is required — set it before starting apps/api")

  // Capture the raw JSON body verbatim so the HMAC can be verified against
  // the exact bytes HitPay signed. Fastify's default JSON parser discards
  // whitespace and re-serialises; we need the original buffer.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body)
  })

  app.post<{ Body: string }>("/webhooks/hitpay", async (request, reply) => {
    const rawBody = request.body
    const signature = request.headers["hitpay-signature"]

    // 1. Verify HMAC-SHA256 signature from Hitpay-Signature header.
    if (typeof signature !== "string" || !verifyWebhookSignature(rawBody, signature, salt)) {
      request.log.warn({ path: "/webhooks/hitpay" }, "webhook signature invalid or missing")
      return reply.status(401).send({ error: "invalid signature" })
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      request.log.warn("hitpay webhook: body is not valid JSON")
      return reply.status(400).send({ error: "invalid body" })
    }

    const eventType = request.headers["hitpay-event-type"]
    const paymentId = typeof payload["payment_id"] === "string" ? payload["payment_id"] : ""
    const status = typeof payload["status"] === "string" ? payload["status"] : ""
    const amountStr = typeof payload["amount"] === "string" ? payload["amount"] : "0.00"
    const feesStr = typeof payload["fees"] === "string" ? payload["fees"] : "0.00"
    const recurringBillingId = payload["recurring_billing_id"]
    const paymentRequestId = payload["payment_request_id"]

    // 2. Route by event type header, falling back to payload shape.
    if (
      eventType === "charge.created" ||
      eventType === "recurring_billing.subscription_updated" ||
      typeof recurringBillingId === "string"
    ) {
      if (typeof recurringBillingId === "string") {
        await handleMembershipCharge({ app, recurringBillingId, paymentId, status, amountStr })
      }
    } else if (
      eventType === "payment_request.completed" ||
      eventType === "payment_request.failed" ||
      typeof paymentRequestId === "string"
    ) {
      if (typeof paymentRequestId === "string") {
        await handleBrandSubscriptionPayment({
          app,
          paymentRequestId,
          paymentId,
          status,
          feesStr,
        })
      }
    } else {
      request.log.warn({ eventType, paymentId }, "hitpay webhook: unrecognised event shape")
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
          // Renewal: expire the current active row first (satisfies the partial
          // unique index member_subscriptions_active_user_unique_idx which allows
          // only one active row per user), then insert the new period row.
          await tx
            .update(schema.memberSubscriptions)
            .set({ status: "expired", updatedAt: now })
            .where(eq(schema.memberSubscriptions.id, sub.id))

          const periodStart = sub.periodEnd
          const periodEnd = new Date(periodStart)
          periodEnd.setFullYear(periodEnd.getFullYear() + 1)

          const newSubId = randomUUID()
          await tx.insert(schema.memberSubscriptions).values({
            id: newSubId,
            userId: sub.userId,
            status: "active",
            priceMyrSen: sub.priceMyrSen,
            hitpayRecurringId: recurringBillingId,
            hitpayPaymentId: paymentId,
            periodStart,
            periodEnd,
          })

          // Ledger references the newly created row, not the expired one.
          const txnId = randomUUID()
          await tx.insert(schema.ledgerEntries).values({
            transactionId: txnId,
            idempotencyKey: `membership:recurring:${paymentId}:credit`,
            direction: "credit",
            account: "revenue:platform_subscription",
            amountMinor: parseSen(amountStr),
            currency: "MYR",
            revenueSource: "platform_subscription",
            referenceId: newSubId,
            referenceType: "member_subscription",
          })

          app.log.info(
            { expiredId: sub.id, newSubId, paymentId },
            "hitpay webhook: membership renewed",
          )
          return
        }

        // First activation ledger leg.
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

        app.log.info({ subscriptionId: sub.id, paymentId }, "hitpay webhook: membership activated")
        return
      }

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
      // Lookup by hitpay_payment_request_id (set at checkout, never mutated).
      // hitpay_payment_id is set on first activation and used for idempotency.
      const rows = await tx
        .select()
        .from(schema.brandSubscriptions)
        .where(eq(schema.brandSubscriptions.hitpayPaymentRequestId, paymentRequestId))
        .limit(1)

      const sub = rows[0]
      if (!sub) {
        app.log.warn(
          { paymentRequestId },
          "hitpay webhook: no brand_subscription found for payment request",
        )
        return
      }

      // Idempotency — already processed this exact charge.
      if (sub.hitpayPaymentId === paymentId) {
        app.log.info({ paymentId }, "hitpay webhook: brand subscription already processed")
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
