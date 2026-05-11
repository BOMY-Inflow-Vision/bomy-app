import { and, eq, gt, lte, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const
const DEFAULT_NOTIFY_DAYS = [30, 14, 7, 1]

async function readNotifyDays(db: Database): Promise<number[]> {
  const rows = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read renewal notification days config" },
    async (tx) =>
      tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "renewal_notification_days")),
  )
  const raw = rows[0]?.value
  if (Array.isArray(raw) && raw.every((v) => typeof v === "number")) return raw
  return [...DEFAULT_NOTIFY_DAYS]
}

/**
 * Send renewal reminder stubs for active platform memberships expiring at each
 * configured milestone (default T-30/14/7/1). Each milestone window is
 * non-overlapping: T-30 covers (14d, 30d], T-14 covers (7d, 14d], etc. so a
 * single job run never fires multiple milestones for the same subscription.
 *
 * The UPDATE is issued before the stub log so a concurrent retry cannot
 * duplicate the send.
 *
 * Returns total number of notification stubs emitted.
 */
export async function notifyRenewalsDue(db: Database): Promise<number> {
  const notifyDays = await readNotifyDays(db)
  // Descending sort so we can derive each window's lower bound from the next element.
  const sorted = [...notifyDays].sort((a, b) => b - a)

  let total = 0
  const now = Date.now()

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i]!
    const lowerDay = sorted[i + 1] ?? 0

    const upperCutoff = new Date(now + day * 24 * 60 * 60 * 1000)
    const lowerCutoff = new Date(now + lowerDay * 24 * 60 * 60 * 1000)

    // Atomically claim matching rows via UPDATE … RETURNING so a concurrent
    // retry sees the updated notified_days and skips the already-sent rows.
    const updated = await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: `renewal notification T-${day}` },
      async (tx) =>
        tx
          .update(schema.memberSubscriptions)
          .set({
            notifiedDays: sql`${schema.memberSubscriptions.notifiedDays} || ${JSON.stringify([day])}::jsonb`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.memberSubscriptions.status, "active"),
              lte(schema.memberSubscriptions.periodEnd, upperCutoff),
              gt(schema.memberSubscriptions.periodEnd, lowerCutoff),
              sql`NOT (${schema.memberSubscriptions.notifiedDays} @> ${JSON.stringify([day])}::jsonb)`,
            ),
          )
          .returning({
            id: schema.memberSubscriptions.id,
            userId: schema.memberSubscriptions.userId,
            periodEnd: schema.memberSubscriptions.periodEnd,
          }),
    )

    for (const row of updated) {
      console.log(
        `[stub-email] Renewal notice T-${day}: userId=${row.userId} periodEnd=${row.periodEnd.toISOString()}`,
      )
      total++
    }
  }

  return total
}
