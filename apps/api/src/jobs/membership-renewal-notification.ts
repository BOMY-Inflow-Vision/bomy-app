import { and, eq, lte, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

// Milestone days at which renewal reminder emails are sent.
const NOTIFY_DAYS = [30, 14, 7, 1] as const

/**
 * Send renewal reminder stubs for active platform memberships expiring within
 * 30/14/7/1 days. Each milestone fires once per subscription — recorded in
 * `notified_days` so duplicate sends are impossible even if the job re-runs.
 *
 * Returns total number of notification stubs emitted.
 */
export async function notifyRenewalsDue(db: Database): Promise<number> {
  let total = 0

  for (const day of NOTIFY_DAYS) {
    const cutoff = new Date(Date.now() + day * 24 * 60 * 60 * 1000)

    const rows = await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: `renewal notification T-${day}` },
      async (tx) =>
        tx
          .select({
            id: schema.memberSubscriptions.id,
            userId: schema.memberSubscriptions.userId,
            periodEnd: schema.memberSubscriptions.periodEnd,
          })
          .from(schema.memberSubscriptions)
          .where(
            and(
              eq(schema.memberSubscriptions.status, "active"),
              lte(schema.memberSubscriptions.periodEnd, cutoff),
              // Skip if this milestone day already recorded
              sql`NOT (${schema.memberSubscriptions.notifiedDays} @> ${JSON.stringify([day])}::jsonb)`,
            ),
          ),
    )

    for (const row of rows) {
      console.log(
        `[stub-email] Renewal notice T-${day}: userId=${row.userId} periodEnd=${row.periodEnd.toISOString()}`,
      )

      await withAdmin(
        db,
        { userId: SYSTEM_ACTOR, reason: `record renewal notification T-${day}` },
        async (tx) => {
          await tx
            .update(schema.memberSubscriptions)
            .set({
              notifiedDays: sql`${schema.memberSubscriptions.notifiedDays} || ${JSON.stringify([day])}::jsonb`,
              updatedAt: new Date(),
            })
            .where(eq(schema.memberSubscriptions.id, row.id))
        },
      )

      total++
    }
  }

  return total
}
