/**
 * Review-state helpers for the HitPay order webhook (PR #32).
 *
 * Three exports, all consumed by `handleOrderPayment` (Task 10):
 *
 *   parkPaymentReview     — transition pending_payment → payment_review_required
 *                           with a structured reason. Spec §3.8.
 *   warnOnEventCollision  — emit `webhook_event_id_collision` when a duplicate
 *                           psp_event_id carries different content. Spec §3.2.
 *   runConsistencyCheck   — read-only forensic audit on idempotency hits.
 *                           Spec §3.5. Logs `order_payment_idempotent` on
 *                           pass, `consistency_check_failed` on mismatch.
 *                           NEVER throws — preserves the 200-always contract.
 *
 * Imports stay scoped to ./types.js + @bomy/db + drizzle. No dependency on
 * order-fanout.ts (handleOrderPayment imports FROM this file, not the
 * other way round).
 */
import { schema, type Database } from "@bomy/db"
import { and, eq, sql } from "drizzle-orm"

import type { CheckoutSessionRow, OrderPaymentArgs } from "./types.js"

// ─── parkPaymentReview ─────────────────────────────────────────────────

export type PaymentReviewReason =
  | "amount_mismatch"
  | "invalid_commission_config"
  | "voucher_claim_failed"

/**
 * Transition the session into `payment_review_required` with the given
 * reason. WHERE-guarded on `status = 'pending_payment'` so a late call
 * after another transition has occurred is a silent no-op. Bob B9
 * conditional spread on psp_payment_id so an empty paymentId never
 * writes "" to the partial unique index.
 *
 * Caller is responsible for emitting the ops-critical structured log
 * (`order_payment_review` at level: error) before invoking this; the
 * helper itself is silent so the same writer can be reused for new
 * reasons added later without duplicating the log call.
 */
export async function parkPaymentReview(
  tx: Database,
  session: CheckoutSessionRow,
  reason: PaymentReviewReason,
  args: Pick<OrderPaymentArgs, "paymentId">,
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
}

// ─── warnOnEventCollision ──────────────────────────────────────────────

/**
 * Inspect the existing row returned by `claimEvent` when ownership was
 * already taken, and emit `webhook_event_id_collision` at level: error
 * when the new event's hash or type differs. HitPay should never reuse
 * a psp_event_id for a different payload; if we see one, it's either a
 * replay attack or a HitPay bug worth paging on.
 *
 * Synchronous, no DB I/O, never throws. Returns void.
 */
export function warnOnEventCollision(
  args: Pick<OrderPaymentArgs, "app" | "eventIdentity">,
  existing: { payloadHash: string; eventType: string },
): void {
  const { eventIdentity } = args
  if (
    existing.payloadHash !== eventIdentity.payloadHash ||
    existing.eventType !== eventIdentity.eventType
  ) {
    args.app.log.error(
      {
        event: "webhook_event_id_collision",
        pspEventId: eventIdentity.pspEventId,
        existingHash: existing.payloadHash,
        newHash: eventIdentity.payloadHash,
        existingType: existing.eventType,
        newType: eventIdentity.eventType,
      },
      "hitpay webhook: duplicate event_id with different payload — possible replay or HitPay bug",
    )
  }
}

// ─── runConsistencyCheck ───────────────────────────────────────────────

/**
 * Observed consistency profile for one checkout session, used by
 * runConsistencyCheck to verify the steady state matches the session
 * status.
 */
interface ConsistencyProfile {
  /** Number of `orders` rows for this session. */
  orderCount: number
  /** Number of `checkout_session_stores` rows — expected order count after fan-out. */
  storeCount: number
  /** Whether the ledger credit `checkout:{sessionId}:credit` was written. */
  creditExists: boolean
  /** Distinct `status` values across this session's inventory_reservations. */
  reservationStatuses: Set<string>
  /** True if the session's voucher has been redeemed; null if no voucher_id on the session. */
  voucherRedeemed: boolean | null
}

async function readConsistencyProfile(
  tx: Database,
  session: CheckoutSessionRow,
): Promise<ConsistencyProfile> {
  const [orderRows, storeRows, creditRows, reservationRows] = await Promise.all([
    tx
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(eq(schema.orders.checkoutSessionId, session.id)),
    tx
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.checkoutSessionStores)
      .where(eq(schema.checkoutSessionStores.checkoutSessionId, session.id)),
    tx
      .select({ id: schema.ledgerEntries.id })
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.idempotencyKey, `checkout:${session.id}:credit`),
          eq(schema.ledgerEntries.direction, "credit"),
        ),
      )
      .limit(1),
    tx
      .select({ status: schema.inventoryReservations.status })
      .from(schema.inventoryReservations)
      .where(eq(schema.inventoryReservations.checkoutSessionId, session.id)),
  ])

  let voucherRedeemed: boolean | null = null
  if (session.voucherId) {
    const voucherRows = await tx
      .select({ redeemedAt: schema.vouchers.redeemedAt })
      .from(schema.vouchers)
      .where(eq(schema.vouchers.id, session.voucherId))
      .limit(1)
    voucherRedeemed = voucherRows[0] ? voucherRows[0].redeemedAt !== null : false
  }

  return {
    orderCount: Number(orderRows[0]?.c ?? 0),
    storeCount: Number(storeRows[0]?.c ?? 0),
    creditExists: creditRows.length > 0,
    reservationStatuses: new Set(reservationRows.map((r) => r.status)),
    voucherRedeemed,
  }
}

/**
 * Per-status expected profile. Returns a list of human-readable
 * mismatch strings (empty on pass). Each string is sufficient by
 * itself to identify the failure when surfaced through Pino — ops
 * see e.g. `mismatches: ["orders_count(0!=2)", "ledger_credit_missing"]`.
 *
 * Status → expected profile (spec §3.5):
 *   paid                                    → orders=storeCount, ledger credit exists, all reservations 'converted'
 *   failed                                  → no orders, no ledger credit, reservations in {released, expired}
 *   payment_review_required + voucher_claim_failed
 *                                           → orders=storeCount, ledger credit exists, voucher NOT redeemed
 *   payment_review_required + amount_mismatch / invalid_commission_config
 *                                           → no orders, no ledger credit
 *   payment_review_resolved                 → treated like prior payment_review_required profile per reason
 *   cancelled / expired                     → no orders, no ledger credit
 *   pending_payment (idempotency hit)       → severe bug: event was claimed but session never transitioned
 */
function findMismatches(session: CheckoutSessionRow, p: ConsistencyProfile): string[] {
  const mismatches: string[] = []

  const expectNoOrders = (label: string) => {
    if (p.orderCount > 0) mismatches.push(`orders_present_on_${label}(${p.orderCount})`)
  }
  const expectNoLedger = (label: string) => {
    if (p.creditExists) mismatches.push(`ledger_credit_present_on_${label}`)
  }
  const expectOrdersMatchStores = () => {
    if (p.orderCount !== p.storeCount) {
      mismatches.push(`orders_count(${p.orderCount}!=${p.storeCount})`)
    }
  }
  const expectCreditExists = () => {
    if (!p.creditExists) mismatches.push("ledger_credit_missing")
  }

  switch (session.status) {
    case "paid":
      expectOrdersMatchStores()
      expectCreditExists()
      // Every reservation row for this session must be 'converted'.
      // An empty set is also a mismatch — paid session should have had reservations.
      if (p.reservationStatuses.size === 0) {
        mismatches.push("reservations_missing_on_paid")
      } else {
        for (const s of p.reservationStatuses) {
          if (s !== "converted") mismatches.push(`reservation_status_on_paid(${s})`)
        }
      }
      // If the session had a voucher, it must be redeemed (or null for vouchers that became unredeemed via voucher_claim_failed which is a different status).
      if (session.voucherId && p.voucherRedeemed === false) {
        mismatches.push("voucher_not_redeemed_on_paid")
      }
      break

    case "failed":
      expectNoOrders("failed")
      expectNoLedger("failed")
      for (const s of p.reservationStatuses) {
        // Released by runFailureRelease; expired by the expiry job.
        // Converted/active on a failed session is a bug.
        if (s !== "released" && s !== "expired") {
          mismatches.push(`reservation_status_on_failed(${s})`)
        }
      }
      break

    case "payment_review_required":
    case "payment_review_resolved": {
      // Profile depends on the original reason. payment_review_resolved
      // inherits its prior profile from the reason field per spec §3.5.
      const reason = session.paymentReviewReason
      if (reason === "voucher_claim_failed") {
        // Fan-out completed; orders + ledger present; voucher remained unclaimed.
        expectOrdersMatchStores()
        expectCreditExists()
        if (session.voucherId && p.voucherRedeemed === true) {
          // If voucher_claim_failed and then somehow got redeemed, that's
          // a state we didn't anticipate.
          mismatches.push("voucher_redeemed_on_voucher_claim_failed")
        }
      } else if (reason === "amount_mismatch" || reason === "invalid_commission_config") {
        // Fan-out never ran for these reasons; no orders, no ledger.
        expectNoOrders(reason)
        expectNoLedger(reason)
      } else if (reason === null) {
        // CHECK constraint should prevent this state, but log defensively.
        mismatches.push(`payment_review_state_without_reason`)
      } else {
        mismatches.push(`payment_review_unknown_reason(${reason})`)
      }
      break
    }

    case "cancelled":
    case "expired": {
      // Buyer cancel or expiry job. No orders, no ledger credit.
      expectNoOrders(session.status)
      expectNoLedger(session.status)
      break
    }

    case "pending_payment": {
      // Severe: claimEvent reported `owned: false` for an event whose
      // session is somehow still pending_payment. Either the prior
      // transaction crashed after writing processed_webhook_events but
      // before transitioning the session, or there's a code bug.
      mismatches.push("idempotency_hit_but_session_still_pending")
      break
    }

    default:
      mismatches.push(`unexpected_session_status(${session.status as string})`)
  }

  return mismatches
}

/**
 * Read-only forensic audit run when claimEvent reports the event is
 * already processed. Verifies the session's dependents (orders,
 * ledger, reservations, voucher) are in the steady state expected for
 * the current session.status + payment_review_reason.
 *
 * Outputs:
 *   pass     → log.info({ event: "order_payment_idempotent", consistencyCheck: "pass" })
 *   mismatch → log.error({ event: "consistency_check_failed", mismatches: [...] })
 *
 * Never throws. Even if the SELECTs themselves fail (e.g., connection
 * dropped mid-tx), the error is caught and re-emitted via the error
 * log, preserving the 200-always webhook contract that spec §1 hard-
 * constraint mandates.
 */
export async function runConsistencyCheck(
  tx: Database,
  session: CheckoutSessionRow,
  args: Pick<OrderPaymentArgs, "app" | "eventIdentity">,
): Promise<void> {
  try {
    const profile = await readConsistencyProfile(tx, session)
    const mismatches = findMismatches(session, profile)

    if (mismatches.length === 0) {
      args.app.log.info(
        {
          event: "order_payment_idempotent",
          sessionId: session.id,
          eventId: args.eventIdentity.pspEventId,
          previousStatus: session.status,
          consistencyCheck: "pass",
        },
        "hitpay webhook: idempotency hit — consistency OK",
      )
      return
    }

    args.app.log.error(
      {
        event: "consistency_check_failed",
        sessionId: session.id,
        eventId: args.eventIdentity.pspEventId,
        sessionStatus: session.status,
        paymentReviewReason: session.paymentReviewReason,
        mismatches,
        profile: {
          orderCount: profile.orderCount,
          storeCount: profile.storeCount,
          creditExists: profile.creditExists,
          reservationStatuses: [...profile.reservationStatuses],
          voucherRedeemed: profile.voucherRedeemed,
        },
      },
      "hitpay webhook: idempotency hit — consistency mismatch",
    )
  } catch (err) {
    // Defensive: any unexpected error inside the read-only audit MUST
    // NOT bubble out of the helper. Spec §1 mandates 2xx on every
    // signed event; consistency failures are alerts, not failures.
    args.app.log.error(
      {
        event: "consistency_check_failed",
        sessionId: session.id,
        eventId: args.eventIdentity.pspEventId,
        err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        mismatchType: "internal_error",
      },
      "hitpay webhook: consistency check internal error",
    )
  }
}
