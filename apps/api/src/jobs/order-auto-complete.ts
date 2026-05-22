import { eq, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const
const BATCH_LIMIT = 500

export const ORDER_AUTO_COMPLETE_CRON = "0 1 * * *" // 01:00 MYT daily

async function readConfigDays(db: Database, key: string): Promise<number | null> {
  const rows = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: `read config ${key}` },
    async (tx) =>
      tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, key)),
  )
  const raw = rows[0]?.value
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw
  return null
}

/**
 * Two-pass order auto-completion (spec §10.2).
 *
 * Pass 1: shipped → delivered after `order_auto_delivered_days` (default 30).
 * Pass 2: delivered → completed after `order_auto_complete_days` (default 7).
 *
 * Each pass:
 *   - reads its config independently; missing/invalid → warn + skip that pass
 *   - runs in its own withAdmin transaction so Pass 1 commits before Pass 2 reads
 *   - uses CTE + FOR UPDATE SKIP LOCKED with BATCH_LIMIT=500 so concurrent
 *     order writers (seller dashboard, webhook) are not blocked
 *
 * Cooling-off invariant: a row promoted shipped→delivered in Pass 1 has
 * `delivered_at = now()`, so Pass 2's `delivered_at < now() - N days` filter
 * excludes it. The order must wait the full N-day window before completing.
 */
export async function runOrderAutoCompleteJob(db: Database): Promise<void> {
  const autoDeliveredDays = await readConfigDays(db, "order_auto_delivered_days")
  const autoCompleteDays = await readConfigDays(db, "order_auto_complete_days")

  // Pass 1 — shipped → delivered
  if (autoDeliveredDays === null) {
    console.warn(
      JSON.stringify({
        event: "order_auto_complete_config_missing",
        key: "order_auto_delivered_days",
      }),
    )
  } else {
    await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: "order_auto_complete_job pass1" },
      async (tx) => {
        const rows = await tx.execute<{ id: string }>(sql`
          WITH candidates AS (
            SELECT id FROM orders
             WHERE fulfilment_status = 'shipped'
               AND shipped_at < now() - (${autoDeliveredDays} * interval '1 day')
             ORDER BY shipped_at ASC
             LIMIT ${BATCH_LIMIT}
               FOR UPDATE SKIP LOCKED
          )
          UPDATE orders o
             SET fulfilment_status = 'delivered',
                 delivered_at      = now(),
                 updated_at        = now()
            FROM candidates c
           WHERE o.id = c.id
          RETURNING o.id
        `)
        console.info(JSON.stringify({ event: "order_auto_delivered", count: rows.length }))
      },
    )
  }

  // Pass 2 — delivered → completed (separate transaction after Pass 1 commits)
  if (autoCompleteDays === null) {
    console.warn(
      JSON.stringify({
        event: "order_auto_complete_config_missing",
        key: "order_auto_complete_days",
      }),
    )
  } else {
    await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: "order_auto_complete_job pass2" },
      async (tx) => {
        const rows = await tx.execute<{ id: string }>(sql`
          WITH candidates AS (
            SELECT id FROM orders
             WHERE fulfilment_status = 'delivered'
               AND delivered_at < now() - (${autoCompleteDays} * interval '1 day')
             ORDER BY delivered_at ASC
             LIMIT ${BATCH_LIMIT}
               FOR UPDATE SKIP LOCKED
          )
          UPDATE orders o
             SET fulfilment_status = 'completed',
                 completed_at      = now(),
                 updated_at        = now()
            FROM candidates c
           WHERE o.id = c.id
          RETURNING o.id
        `)
        console.info(JSON.stringify({ event: "order_auto_completed", count: rows.length }))
      },
    )
  }
}
