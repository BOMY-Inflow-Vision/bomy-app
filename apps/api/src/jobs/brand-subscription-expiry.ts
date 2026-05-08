import { and, eq, isNull, lte } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

/**
 * Expire active brand subscriptions that have passed their period_end.
 * Returns count of rows updated.
 */
async function expireBrandSubscriptions(db: Database): Promise<number> {
  return withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "expire brand subscriptions past period_end" },
    async (tx) => {
      const rows = await tx
        .update(schema.brandSubscriptions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(schema.brandSubscriptions.status, "active"),
            lte(schema.brandSubscriptions.periodEnd, new Date()),
          ),
        )
        .returning({ id: schema.brandSubscriptions.id })
      return rows.length
    },
  )
}

/**
 * Expire active platform memberships that have lapsed (no cancelledAt, period
 * ended without renewal). Rows with cancelledAt set are handled separately by
 * expireCancelledMemberships (sets status='cancelled').
 * Returns count of rows updated.
 */
async function expireLapsedMemberSubscriptions(db: Database): Promise<number> {
  return withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "expire lapsed member subscriptions past period_end" },
    async (tx) => {
      const rows = await tx
        .update(schema.memberSubscriptions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(schema.memberSubscriptions.status, "active"),
            isNull(schema.memberSubscriptions.cancelledAt),
            lte(schema.memberSubscriptions.periodEnd, new Date()),
          ),
        )
        .returning({ id: schema.memberSubscriptions.id })
      return rows.length
    },
  )
}

/**
 * Run both expiry sweeps. Called by BrandSubscriptionExpiryJob (daily 00:05 MYT).
 * Returns counts of rows updated in each table.
 */
export async function expireSubscriptions(
  db: Database,
): Promise<{ brandCount: number; memberCount: number }> {
  const [brandCount, memberCount] = await Promise.all([
    expireBrandSubscriptions(db),
    expireLapsedMemberSubscriptions(db),
  ])
  return { brandCount, memberCount }
}
