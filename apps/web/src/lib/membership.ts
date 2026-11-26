/**
 * Grace window after which a still-`pending` membership checkout is treated as
 * abandoned. A `pending` row is created BEFORE the user is redirected to HitPay,
 * so its mere existence does not prove payment. HitPay webhooks land within
 * seconds; 30 minutes is a generous buffer that only ever catches genuinely
 * abandoned checkouts.
 */
export const PENDING_GRACE_MS = 30 * 60 * 1000

interface PendingCandidate {
  status: string
  pspPaymentId: string | null
  /**
   * Transition (until the contract PR drops hitpay_*): a row paid by pre-dual-write webhook
   * code carries only hitpay_payment_id, so either column proves payment.
   */
  hitpayPaymentId: string | null
  createdAt: Date
}

/**
 * A pending membership is "abandoned" when it never received a payment
 * confirmation and was started longer ago than the grace window. Such rows must
 * not be presented as a successful/in-progress payment, and must not block a
 * fresh join.
 */
export function isPendingAbandoned(row: PendingCandidate, now: Date): boolean {
  // `?? null`: a missing column (undefined) counts as "no payment id", never as paid-and-unknown.
  const paid = (row.pspPaymentId ?? null) !== null || (row.hitpayPaymentId ?? null) !== null
  return (
    row.status === "pending" && !paid && row.createdAt.getTime() <= now.getTime() - PENDING_GRACE_MS
  )
}
