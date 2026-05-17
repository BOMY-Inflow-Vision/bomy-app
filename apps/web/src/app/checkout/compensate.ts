/**
 * Stage 5 PR #31 — checkout initiation compensation.
 *
 * Inverse of initiateCheckout's Phase 1. Releases active inventory
 * reservations (restoring stock_count), releases the voucher
 * reservation, and marks the checkout session cancelled.
 *
 * Single withAdmin transaction so the audit row + all writes commit or
 * roll back together (PR #26 invariant).
 *
 * Idempotent + ownership-guarded. The leading SELECT FOR UPDATE filters
 * on (id, user_id, status = 'pending_payment'); a second call, a call
 * from a different buyer, or a call against a paid / expired / review /
 * cancelled session is a no-op.
 *
 * Cancel-only semantics: this helper writes status = 'cancelled' on the
 * session and 'released' on reservations. The InventoryReservationExpiryJob
 * (Task 19) requires 'expired' transitions and `FOR UPDATE OF cs, r
 * SKIP LOCKED` — it must NOT call this helper; it owns its own flow.
 *
 * Callers:
 *   - initiateCheckout Phase 1b failure path (Task 12)
 *   - cancelPendingCheckout buyer-initiated (Task 13)
 */

import { and, eq, isNull, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"
import type { Database } from "@bomy/db"

export type CompensateInitiationArgs = {
  sessionId: string
  buyerId: string
  reason: string
  // Audit-row actor. Defaults to the buyer when omitted. Buyer-initiated
  // cancel and Phase 1b failure both run under the buyer's session, so
  // buyer-as-actor is correct there.
  actorUserId?: string
}

export type CompensateInitiationResult = {
  // false when the session was not (pending_payment AND owned by buyerId)
  // — i.e. already cancelled/paid/expired/review, or belongs to someone else.
  compensated: boolean
  releasedReservationCount: number
  releasedVoucherCount: number
}

export async function compensateInitiation(
  db: Database,
  args: CompensateInitiationArgs,
): Promise<CompensateInitiationResult> {
  return withAdmin(
    db,
    {
      userId: args.actorUserId ?? args.buyerId,
      reason: `checkout_compensation:${args.reason}:${args.sessionId}`,
    },
    async (tx) => {
      // 1. Lock the session and enforce ownership + pending_payment.
      //    Any mismatch → early no-op.
      const sessionRows = await tx
        .select({ id: schema.checkoutSessions.id })
        .from(schema.checkoutSessions)
        .where(
          and(
            eq(schema.checkoutSessions.id, args.sessionId),
            eq(schema.checkoutSessions.userId, args.buyerId),
            eq(schema.checkoutSessions.status, "pending_payment"),
          ),
        )
        .for("update")
        .limit(1)

      if (sessionRows.length === 0) {
        return { compensated: false, releasedReservationCount: 0, releasedVoucherCount: 0 }
      }

      // 2. Release only active reservations. RETURNING gives the qty
      //    of each row that flipped active → released, which drives the
      //    exactly-once stock restore below: a repeat call against an
      //    already-compensated session yields zero RETURNING rows.
      const released = await tx
        .update(schema.inventoryReservations)
        .set({ status: "released", updatedAt: new Date() })
        .where(
          and(
            eq(schema.inventoryReservations.checkoutSessionId, args.sessionId),
            eq(schema.inventoryReservations.status, "active"),
          ),
        )
        .returning({
          variantId: schema.inventoryReservations.variantId,
          quantity: schema.inventoryReservations.quantity,
        })

      for (const row of released) {
        await tx
          .update(schema.productVariants)
          .set({
            stockCount: sql`${schema.productVariants.stockCount} + ${row.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.productVariants.id, row.variantId))
      }

      // 3. Release the voucher reservation tied to this session.
      //    user_id guards against touching another buyer's voucher;
      //    redeemed_at IS NULL preserves vouchers already settled at
      //    the PR #32 webhook (those must not be un-stamped).
      const releasedVouchers = await tx
        .update(schema.vouchers)
        .set({ reservedCheckoutSessionId: null, reservedAt: null })
        .where(
          and(
            eq(schema.vouchers.reservedCheckoutSessionId, args.sessionId),
            eq(schema.vouchers.userId, args.buyerId),
            isNull(schema.vouchers.redeemedAt),
          ),
        )
        .returning({ id: schema.vouchers.id })

      // 4. Flip the session to cancelled. The same ownership + state
      //    guard is repeated on the UPDATE as a belt-and-braces for any
      //    future caller that loses the SELECT FOR UPDATE serialisation.
      await tx
        .update(schema.checkoutSessions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(schema.checkoutSessions.id, args.sessionId),
            eq(schema.checkoutSessions.userId, args.buyerId),
            eq(schema.checkoutSessions.status, "pending_payment"),
          ),
        )

      return {
        compensated: true,
        releasedReservationCount: released.length,
        releasedVoucherCount: releasedVouchers.length,
      }
    },
  )
}
