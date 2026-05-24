import { and, eq, gt, inArray, lte, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

import type { Mailer } from "../lib/mailer.js"
import { sendRenewalEmail } from "../notifications/membership.js"

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
 * Send renewal reminders for active memberships at each configured milestone.
 * UPDATE claiming the row commits before any email is sent. A send failure
 * logs email_notification_failed and continues — the claim is already durable.
 * Returns total number of emails attempted.
 */
export async function notifyRenewalsDue(db: Database, mailer: Mailer): Promise<number> {
  const notifyDays = await readNotifyDays(db)
  const sorted = [...notifyDays].sort((a, b) => b - a)

  let total = 0
  const now = Date.now()

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i]!
    const lowerDay = sorted[i + 1] ?? 0

    const upperCutoff = new Date(now + day * 24 * 60 * 60 * 1000)
    const lowerCutoff = new Date(now + lowerDay * 24 * 60 * 60 * 1000)

    // Atomically claim matching rows and fetch user emails in one transaction.
    const claimed = await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: `renewal notification T-${day}` },
      async (tx) => {
        const updated = await tx
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
          })

        if (updated.length === 0) return []

        const userRows = await tx
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(
            inArray(
              schema.users.id,
              updated.map((r) => r.userId),
            ),
          )

        const emailById = new Map(userRows.map((r) => [r.id, r.email]))

        return updated.map((r) => ({
          userId: r.userId,
          periodEnd: r.periodEnd,
          email: emailById.get(r.userId) ?? null,
        }))
      },
    )

    for (const row of claimed) {
      if (!row.email) continue
      try {
        await sendRenewalEmail(mailer, {
          email: row.email,
          periodEnd: row.periodEnd,
          daysBefore: day,
        })
      } catch (err) {
        // Claim already committed — log failure and continue remaining rows.
        console.error(
          JSON.stringify({
            event: "email_notification_failed",
            userId: row.userId,
            daysBefore: day,
            err: String(err),
          }),
        )
      }
      total++
    }
  }

  return total
}
