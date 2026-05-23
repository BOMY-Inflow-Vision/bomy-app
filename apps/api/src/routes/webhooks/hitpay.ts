import { randomUUID } from "node:crypto"

import { schema, withAdmin } from "@bomy/db"
import { verifyWebhookSignature } from "@bomy/hitpay"
import { and, desc, eq } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"

import { trace } from "@opentelemetry/api"
import { deriveEventIdentity } from "../../webhooks/hitpay/idempotency.js"
import { handleOrderPayment } from "../../webhooks/hitpay/order-fanout.js"

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
    // charge.updated refund events must include refund_amount. We do NOT fall
    // back to amount because non-refund charge updates also carry an amount
    // field — treating it as a refund amount would create false ledger entries.
    const refundAmountStr =
      typeof payload["refund_amount"] === "string" ? payload["refund_amount"] : null
    // HitPay may include a refund_id on charge.updated. When present it is used
    // as part of the idempotency key so multiple partial refunds on the same
    // payment can each be ledgered independently.
    const refundId = typeof payload["refund_id"] === "string" ? payload["refund_id"] : null

    // 2. Route by event type header.
    //    charge.updated is checked FIRST — before payload-shape fallbacks — so
    //    recurring membership refunds (which also carry recurring_billing_id)
    //    are not swallowed by the membership branch.
    if (eventType === "charge.updated") {
      await handleRefund({ app, paymentId, refundAmountStr, refundId })
    } else if (
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
        const identity = deriveEventIdentity(
          rawBody,
          request.headers as Record<string, string | undefined>,
        )
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
      // ORDER BY created_at DESC: after renewal two rows share the same
      // recurring_id (expired old + active new). Reading the newest ensures
      // idempotency checks see the already-processed payment_id on retry.
      const rows = await tx
        .select()
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.hitpayRecurringId, recurringBillingId))
        .orderBy(desc(schema.memberSubscriptions.createdAt))
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
        // A missing payment_id would write blank idempotency keys into the
        // ledger and set hitpay_payment_id = "" on the subscription row,
        // permanently breaking future idempotency checks.
        if (!paymentId) {
          app.log.error(
            { recurringBillingId },
            "hitpay webhook: membership activation missing payment_id — aborting",
          )
          return
        }

        const now = new Date()

        // Amount guard: webhook gross must equal the subscribed price.
        // A mismatch means HitPay charged a different amount — do not activate.
        let amountSen: bigint
        try {
          amountSen = parseSen(amountStr)
        } catch {
          app.log.error(
            { amountStr, paymentId },
            "hitpay webhook: membership amount unparseable — aborting activation",
          )
          return
        }
        if (amountSen !== sub.priceMyrSen) {
          app.log.error(
            { amountSen, priceMyrSen: sub.priceMyrSen, paymentId },
            "hitpay webhook: membership amount mismatch — aborting activation",
          )
          return
        }

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
            amountMinor: amountSen,
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
          amountMinor: amountSen,
          currency: "MYR",
          revenueSource: "platform_subscription",
          referenceId: sub.id,
          referenceType: "member_subscription",
        })

        app.log.info({ subscriptionId: sub.id, paymentId }, "hitpay webhook: membership activated")
        return
      }

      if (status === "failed") {
        const now = new Date()
        await tx
          .update(schema.memberSubscriptions)
          .set({
            status: "payment_failed",
            ...(paymentId ? { hitpayPaymentId: paymentId } : {}),
            updatedAt: now,
          })
          .where(eq(schema.memberSubscriptions.id, sub.id))

        app.log.info({ subscriptionId: sub.id }, "hitpay webhook: membership payment failed")
      }

      if (status === "cancelled") {
        const now = new Date()
        // Only revoke entitlement once the period has elapsed. Before that,
        // the spec says "membership stays active until period_end" — record
        // the cancellation intent but leave status = 'active' so the user
        // retains access for the remainder of their paid period.
        const entitlementExpired = now >= sub.periodEnd
        if (entitlementExpired) {
          await tx
            .update(schema.memberSubscriptions)
            .set({
              status: "cancelled",
              cancelledAt: sub.cancelledAt ?? now,
              ...(paymentId ? { hitpayPaymentId: paymentId } : {}),
              updatedAt: now,
            })
            .where(eq(schema.memberSubscriptions.id, sub.id))
        } else {
          await tx
            .update(schema.memberSubscriptions)
            .set({
              cancelledAt: sub.cancelledAt ?? now,
              ...(paymentId ? { hitpayPaymentId: paymentId } : {}),
              updatedAt: now,
            })
            .where(eq(schema.memberSubscriptions.id, sub.id))
        }

        app.log.info(
          { subscriptionId: sub.id, entitlementExpired },
          "hitpay webhook: membership cancellation processed",
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
  amountStr: string
  feesStr: string
}

async function handleBrandSubscriptionPayment({
  app,
  paymentRequestId,
  paymentId,
  status,
  amountStr,
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

      // Idempotency: skip if already processed (same payment_id) OR already
      // active. Brand subscriptions are one-time — a duplicate succeeded event
      // with a different payment_id must not re-activate or create extra legs.
      if (sub.hitpayPaymentId === paymentId || sub.status === "active") {
        app.log.info({ paymentId }, "hitpay webhook: brand subscription already processed")
        return
      }

      if (status === "completed" || status === "succeeded") {
        // A missing payment_id would write blank idempotency keys into the
        // ledger and set hitpay_payment_id = "" on the subscription row,
        // permanently breaking future idempotency checks.
        if (!paymentId) {
          app.log.error(
            { paymentRequestId },
            "hitpay webhook: brand sub activation missing payment_id — aborting",
          )
          return
        }

        const priceSen = sub.priceMyrSen

        // Amount guard: webhook gross must equal the subscribed price.
        let webhookAmountSen: bigint
        try {
          webhookAmountSen = parseSen(amountStr)
        } catch {
          app.log.error(
            { amountStr, paymentId },
            "hitpay webhook: brand sub amount unparseable — aborting activation",
          )
          return
        }
        if (webhookAmountSen !== priceSen) {
          app.log.error(
            { webhookAmountSen, priceSen, paymentId },
            "hitpay webhook: brand sub amount mismatch — aborting activation",
          )
          return
        }

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

        // Ledger: revenue credit + payout debit always; processing_fee debit
        // only when feeSen > 0 (ledger_entries.amount_minor > 0 constraint).
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
        ])

        if (feeSen > 0n) {
          await tx.insert(schema.ledgerEntries).values({
            transactionId: txnId,
            idempotencyKey: `brand_sub:${sub.id}:${paymentId}:debit:fee`,
            direction: "debit",
            account: "expense:processing_fee",
            amountMinor: feeSen,
            currency: "MYR",
            revenueSource: "processing_fee",
            referenceId: sub.id,
            referenceType: "brand_subscription",
          })
        }

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

// ─── Refund (charge.updated) ──────────────────────────────────────────────────

interface RefundArgs {
  app: Parameters<FastifyPluginAsync>[0]
  paymentId: string
  // null when refund_amount is absent — non-refund charge.updated events must
  // not create ledger entries, so we require the field to be explicitly present.
  refundAmountStr: string | null
  // When HitPay provides a refund_id, it is included in the idempotency key so
  // multiple partial refunds on the same payment each produce a distinct ledger
  // entry. Without a refund_id (Stage 4 full-refund-only scope), the key is
  // keyed on paymentId alone, allowing exactly one refund per payment.
  refundId: string | null
}

async function handleRefund({
  app,
  paymentId,
  refundAmountStr,
  refundId,
}: RefundArgs): Promise<void> {
  if (!paymentId) {
    app.log.warn("hitpay webhook: charge.updated received without payment_id — skipping")
    return
  }

  if (!refundAmountStr) {
    app.log.info(
      { paymentId },
      "hitpay webhook: charge.updated without refund_amount — not a refund, skipping",
    )
    return
  }

  let refundAmountSen: bigint
  try {
    refundAmountSen = parseSen(refundAmountStr)
  } catch {
    app.log.warn(
      { refundAmountStr, paymentId },
      "hitpay webhook: charge.updated refund amount unparseable — skipping",
    )
    return
  }

  if (refundAmountSen === 0n) {
    app.log.info({ paymentId }, "hitpay webhook: charge.updated with zero refund amount — skipping")
    return
  }

  await withAdmin(
    app.db.db,
    { userId: SYSTEM_ACTOR, reason: "hitpay webhook: refund" },
    async (tx) => {
      // Search membership subscriptions first, then brand subscriptions.
      const memberRows = await tx
        .select()
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.hitpayPaymentId, paymentId))
        .limit(1)

      if (memberRows[0]) {
        const sub = memberRows[0]
        const idemKey = refundId
          ? `refund:${paymentId}:${refundId}:${sub.id}:debit`
          : `refund:${paymentId}:${sub.id}:debit`

        // Idempotency: skip if this refund has already been recorded.
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

        if (existing[0]) {
          app.log.info({ paymentId }, "hitpay webhook: membership refund already recorded")
          return
        }

        await tx.insert(schema.ledgerEntries).values({
          transactionId: randomUUID(),
          idempotencyKey: idemKey,
          direction: "debit",
          account: "revenue:platform_subscription",
          amountMinor: refundAmountSen,
          currency: "MYR",
          revenueSource: "refund",
          referenceId: sub.id,
          referenceType: "member_subscription",
        })
        app.log.info(
          { subscriptionId: sub.id, paymentId, refundAmountSen },
          "hitpay webhook: membership refund recorded",
        )
        return
      }

      const brandRows = await tx
        .select()
        .from(schema.brandSubscriptions)
        .where(eq(schema.brandSubscriptions.hitpayPaymentId, paymentId))
        .limit(1)

      if (brandRows[0]) {
        const sub = brandRows[0]
        const idemKey = refundId
          ? `refund:${paymentId}:${refundId}:${sub.id}:debit`
          : `refund:${paymentId}:${sub.id}:debit`

        // Idempotency: skip if this refund has already been recorded.
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

        if (existing[0]) {
          app.log.info({ paymentId }, "hitpay webhook: brand subscription refund already recorded")
          return
        }

        await tx.insert(schema.ledgerEntries).values({
          transactionId: randomUUID(),
          idempotencyKey: idemKey,
          direction: "debit",
          account: "revenue:brand_subscription",
          amountMinor: refundAmountSen,
          currency: "MYR",
          revenueSource: "refund",
          referenceId: sub.id,
          referenceType: "brand_subscription",
        })
        app.log.info(
          { subscriptionId: sub.id, paymentId, refundAmountSen },
          "hitpay webhook: brand subscription refund recorded",
        )
        return
      }

      app.log.warn(
        { paymentId },
        "hitpay webhook: charge.updated refund — no subscription found for payment_id",
      )
    },
  )
}
