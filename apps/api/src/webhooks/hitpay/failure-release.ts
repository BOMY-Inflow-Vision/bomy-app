/**
 * Failed-path release for HitPay order webhooks (PR #32 spec §3.7).
 *
 * Sequence is REORDERED from the spec's literal "release first, mark
 * session failed last" — sessions is updated FIRST under the
 * `WHERE status = 'pending_payment'` guard, and only if the guarded
 * UPDATE … RETURNING transitions exactly one row do we proceed to
 * release reservations, restore stock, and release the voucher. This:
 *
 *   1. Makes the guarded UPDATE the single source of truth for no-op
 *      behavior on late deliveries. A late `payment_request.failed`
 *      arriving on a `paid` / `payment_review_required` / `cancelled` /
 *      `expired` session sees 0 rows updated and bails before touching
 *      any other state.
 *   2. Protects the `payment_review_required` + `voucher_claim_failed`
 *      state: if the paid fan-out completed but voucher claim raced and
 *      parked the session, a stale failed webhook MUST NOT clear the
 *      voucher reservation (it would corrupt ops reconciliation).
 *   3. Eliminates a redundant JS pre-check (`if session.status !==
 *      'pending_payment'`) that would duplicate the WHERE guard.
 *
 * Transaction-rollback safety: the helper runs inside a single
 * `withAdmin` transaction owned by `handleOrderPayment` (Task 10). If
 * any reservation/stock/voucher UPDATE throws after the session
 * transition, the whole transaction rolls back — including the
 * `admin_bypass_audit` row — and the session returns to
 * `pending_payment`. No partial-failure path can leave the session
 * `failed` with un-released reservations.
 *
 * Lock order: cs (already locked by Task 10 Step B SELECT FOR UPDATE)
 * → inventory_reservations → product_variants → vouchers. Matches the
 * order convention shared with the expiry job, compensation helper,
 * and Task 10 fan-out.
 */
import { schema, type Database } from "@bomy/db"
import { and, eq, isNull, sql } from "drizzle-orm"

import type { CheckoutSessionRow, OrderPaymentArgs } from "./types.js"

export async function runFailureRelease(
  tx: Database,
  session: CheckoutSessionRow,
  args: Pick<OrderPaymentArgs, "app" | "paymentId" | "eventIdentity">,
): Promise<void> {
  // Step 1 — atomic transition. Bob B9: psp_payment_id is conditionally
  // spread. An empty paymentId ("" on a failed event without a payment_id)
  // must NOT be written to the column — the partial unique index
  // `checkout_sessions_psp_payment_id_unique_idx WHERE psp_payment_id IS
  // NOT NULL` treats "" as a real value, so two failed sessions with
  // missing paymentId would collide on the unique index, aborting this
  // transaction and rolling back the entire release.
  const updated = await tx
    .update(schema.checkoutSessions)
    .set({
      status: "failed",
      ...(args.paymentId ? { pspPaymentId: args.paymentId } : {}),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.checkoutSessions.id, session.id),
        eq(schema.checkoutSessions.status, "pending_payment"),
      ),
    )
    .returning({ id: schema.checkoutSessions.id })

  if (updated.length === 0) {
    args.app.log.info(
      {
        sessionId: session.id,
        sessionStatus: session.status,
        eventId: args.eventIdentity.pspEventId,
      },
      "hitpay webhook: failed event arrived after session already terminal — no-op",
    )
    return
  }

  // Step 2 — release active reservations for this session. The
  // `status = 'active'` guard skips rows that have already been
  // converted/released/expired by another path; only rows that
  // transitioned via this UPDATE drive the stock restore below.
  const released = await tx
    .update(schema.inventoryReservations)
    .set({ status: "released", updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.inventoryReservations.checkoutSessionId, session.id),
        eq(schema.inventoryReservations.status, "active"),
      ),
    )
    .returning({
      variantId: schema.inventoryReservations.variantId,
      quantity: schema.inventoryReservations.quantity,
    })

  // Step 3 — restore stock per released reservation.
  for (const r of released) {
    await tx
      .update(schema.productVariants)
      .set({ stockCount: sql`stock_count + ${r.quantity}`, updatedAt: sql`now()` })
      .where(eq(schema.productVariants.id, r.variantId))
  }

  // Step 4 — conservative voucher release. Three predicates as defense
  // in depth:
  //   • id = $voucherId binds to the voucher attached to this session.
  //   • reserved_checkout_session_id = $sessionId confirms the
  //     reservation still belongs to THIS session.
  //   • redeemed_at IS NULL prevents undoing a redemption that a
  //     completed path may have committed.
  // Combined with the session-UPDATE gate above, this is doubly
  // protected against the voucher_claim_failed → payment_review_required
  // state.
  // Capture the UPDATE row count via RETURNING so the structured log
  // reflects the actual mutation, not the attempt. The conservative
  // predicates can legitimately produce 0 rows (voucher belongs to
  // another session, or redeemed_at IS NOT NULL); §6.1 observability
  // requires voucherReleased to mean "this UPDATE cleared the row",
  // not "this session had a voucher_id" (Bob R1).
  let voucherReleased = false
  if (session.voucherId) {
    const releasedVouchers = await tx
      .update(schema.vouchers)
      .set({ reservedCheckoutSessionId: null, reservedAt: null })
      .where(
        and(
          eq(schema.vouchers.id, session.voucherId),
          eq(schema.vouchers.reservedCheckoutSessionId, session.id),
          isNull(schema.vouchers.redeemedAt),
        ),
      )
      .returning({ id: schema.vouchers.id })
    voucherReleased = releasedVouchers.length > 0
  }

  args.app.log.info(
    {
      event: "order_payment_failed",
      sessionId: session.id,
      paymentId: args.paymentId || null,
      eventId: args.eventIdentity.pspEventId,
      reservationsReleased: released.length,
      voucherReleased,
    },
    "hitpay webhook: order payment failed — reservations released",
  )
}
