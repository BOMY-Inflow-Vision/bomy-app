import { and, eq, isNotNull, lte } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

// Shared SYSTEM_ACTOR for background jobs (see ADR-08 for future formalisation).
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

/**
 * Sweep for platform memberships that have passed their period_end without a
 * follow-up HitPay cancellation event. Updates status = 'cancelled' for any
 * row where:
 *   status = 'active' AND cancelled_at IS NOT NULL AND period_end <= now()
 *
 * Run at server start and then every 24 hours via setInterval (see server.ts).
 * Returns the number of rows updated.
 */
export async function expireCancelledMemberships(db: Database): Promise<number> {
  return withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "expire cancelled memberships past period_end" },
    async (tx) => {
      const rows = await tx
        .update(schema.memberSubscriptions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(schema.memberSubscriptions.status, "active"),
            isNotNull(schema.memberSubscriptions.cancelledAt),
            lte(schema.memberSubscriptions.periodEnd, new Date()),
          ),
        )
        .returning({ id: schema.memberSubscriptions.id })
      return rows.length
    },
  )
}
