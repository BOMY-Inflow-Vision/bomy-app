import { and, eq, isNull, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

// Sessions in post-payment states must never have their reservations or
// stock touched by this job — the webhook (PR #32) owns these.
const POST_PAYMENT = new Set<string>(["paid", "payment_review_required", "payment_review_resolved"])

// Bound transaction work — large backlogs drain across multiple runs.
const BATCH_LIMIT = 500

type CandidateRow = {
  reservation_id: string
  variant_id: string
  quantity: number
  session_id: string
  session_status: string
  session_user_id: string
  [key: string]: unknown
}

export interface InventoryReservationExpiryDeps {
  db: Database
  log: { info(obj: object, msg: string): void }
}

/**
 * Expire active inventory reservations past their 5-minute grace and
 * restore the corresponding stock. Touched sessions get their voucher
 * released (ownership-guarded) and, if still `pending_payment`, are
 * transitioned to `expired`. Terminal-state sessions (`failed`,
 * `cancelled`) are left alone but their lingering reservations and
 * vouchers are cleaned up. Orphan `pending_payment` sessions with no
 * PSP id and no remaining active reservations or reserved vouchers are
 * cancelled in a separate pass.
 *
 * Lock order: checkout_sessions → inventory_reservations → product_variants
 * → vouchers. Must match the PR #32 webhook handler order.
 */
export async function runInventoryReservationExpiryJob(
  deps: InventoryReservationExpiryDeps,
): Promise<void> {
  const { db, log } = deps

  await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "inventory_reservation_expiry_job" },
    async (tx) => {
      // 1. Pull candidate reservations + their session metadata.
      //    Locks cs first, then r, then SKIP LOCKED so this job defers
      //    to the webhook fan-out and cancel paths. Post-payment sessions
      //    are filtered in SQL (not just in-loop) so they cannot starve
      //    the batch — see Bob R1.
      const candidates = await tx.execute<CandidateRow>(sql`
        SELECT r.id              AS reservation_id,
               r.variant_id      AS variant_id,
               r.quantity        AS quantity,
               r.checkout_session_id AS session_id,
               cs.status::text   AS session_status,
               cs.user_id        AS session_user_id
          FROM inventory_reservations r
          INNER JOIN checkout_sessions cs ON cs.id = r.checkout_session_id
         WHERE r.status = 'active'
           AND r.expires_at < now() - interval '5 minutes'
           AND cs.status NOT IN ('paid', 'payment_review_required', 'payment_review_resolved')
         ORDER BY r.expires_at ASC
         LIMIT ${BATCH_LIMIT}
         FOR UPDATE OF cs, r SKIP LOCKED
      `)

      const sessionsTouched = new Map<string, string>() // sessionId -> userId

      for (const c of candidates) {
        if (POST_PAYMENT.has(c.session_status)) continue

        // 2. Atomic reservation transition active -> expired.
        const released = await tx
          .update(schema.inventoryReservations)
          .set({ status: "expired", updatedAt: sql`now()` })
          .where(
            and(
              eq(schema.inventoryReservations.id, c.reservation_id),
              eq(schema.inventoryReservations.status, "active"),
            ),
          )
          .returning({ id: schema.inventoryReservations.id })
        if (released.length === 0) continue

        // 3. Restore stock for the released reservation.
        await tx
          .update(schema.productVariants)
          .set({
            stockCount: sql`${schema.productVariants.stockCount} + ${c.quantity}`,
            updatedAt: sql`now()`,
          })
          .where(eq(schema.productVariants.id, c.variant_id))

        sessionsTouched.set(c.session_id, c.session_user_id)
      }

      // 4. Per touched session: release any voucher reservation (ownership +
      //    not-redeemed guard) and expire the session if still pending.
      //    Terminal-status sessions (`failed`, `cancelled`) have their voucher
      //    released here but their `status` is preserved by the
      //    `pending_payment` guard on the session update.
      for (const [sessionId, userId] of sessionsTouched) {
        await tx
          .update(schema.vouchers)
          .set({ reservedCheckoutSessionId: null, reservedAt: null })
          .where(
            and(
              eq(schema.vouchers.reservedCheckoutSessionId, sessionId),
              isNull(schema.vouchers.redeemedAt),
              eq(schema.vouchers.userId, userId),
            ),
          )

        await tx
          .update(schema.checkoutSessions)
          .set({ status: "expired", updatedAt: sql`now()` })
          .where(
            and(
              eq(schema.checkoutSessions.id, sessionId),
              eq(schema.checkoutSessions.status, "pending_payment"),
            ),
          )
      }

      // 5. Orphan cleanup: pending_payment sessions past grace that never
      //    reached HitPay (no PSP id) and have no remaining active
      //    reservations or reserved vouchers. Guarded by NOT EXISTS so we
      //    never cancel a session with in-flight inventory or voucher state.
      const orphans = await tx.execute<{ id: string; [key: string]: unknown }>(sql`
        UPDATE checkout_sessions cs
           SET status = 'cancelled', updated_at = now()
         WHERE cs.status = 'pending_payment'
           AND cs.psp_payment_request_id IS NULL
           AND cs.expires_at < now() - interval '5 minutes'
           AND NOT EXISTS (
             SELECT 1 FROM inventory_reservations r
              WHERE r.checkout_session_id = cs.id AND r.status = 'active'
           )
           AND NOT EXISTS (
             SELECT 1 FROM vouchers v
              WHERE v.reserved_checkout_session_id = cs.id AND v.redeemed_at IS NULL
           )
         RETURNING id
      `)

      log.info(
        {
          candidates: candidates.length,
          sessionsTouched: sessionsTouched.size,
          orphansCancelled: orphans.length,
        },
        "inventory_reservation_expiry_job: done",
      )
    },
  )
}
