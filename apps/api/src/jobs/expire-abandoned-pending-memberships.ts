import { and, eq, isNull, lte } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

// Shared SYSTEM_ACTOR for background jobs (see ADR-08 for future formalisation).
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

/**
 * Grace window after which a still-`pending` membership checkout is treated as
 * abandoned. Kept in sync with the web copy in apps/web/src/lib/membership.ts.
 * A `pending` row is created BEFORE the HitPay redirect, so its existence does
 * not prove payment; the webhook flips it to `active` within seconds when a
 * real payment lands. 30 minutes only ever catches abandoned checkouts.
 */
export const PENDING_GRACE_MS = 30 * 60 * 1000

/**
 * Sweep for abandoned pending memberships — rows the user started at checkout
 * but never paid for (back-button out of HitPay, closed tab, etc.). Updates
 * status = 'expired' for any row where:
 *   status = 'pending' AND hitpay_payment_id IS NULL AND created_at <= now - grace
 *
 * Leaving these as 'pending' traps the user: every membership page redirects a
 * pending user back into the success poller, and the partial unique index on
 * (user_id) WHERE status='pending' blocks a fresh join. Expiring them frees the
 * user to retry. A genuine (but improbably late) payment still activates via the
 * webhook renewal branch, so no payment is lost.
 *
 * Run at server start and then every 24 hours via setInterval (see server.ts).
 * Returns the number of rows updated.
 */
export async function expireAbandonedPendingMemberships(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_GRACE_MS)
  return withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "expire abandoned pending memberships past grace window" },
    async (tx) => {
      const rows = await tx
        .update(schema.memberSubscriptions)
        .set({ status: "expired", updatedAt: now })
        .where(
          and(
            eq(schema.memberSubscriptions.status, "pending"),
            isNull(schema.memberSubscriptions.hitpayPaymentId),
            lte(schema.memberSubscriptions.createdAt, cutoff),
          ),
        )
        .returning({ id: schema.memberSubscriptions.id })
      return rows.length
    },
  )
}
