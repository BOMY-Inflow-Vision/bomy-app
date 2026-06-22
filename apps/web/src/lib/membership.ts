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
  return (
    row.status === "pending" &&
    row.hitpayPaymentId === null &&
    row.createdAt.getTime() <= now.getTime() - PENDING_GRACE_MS
  )
}
