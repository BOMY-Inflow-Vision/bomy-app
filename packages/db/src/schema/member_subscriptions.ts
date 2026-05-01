import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { subscriptionStatusEnum } from "./enums.js"
import { users } from "./users.js"

// One row per #1 platform-membership instance for a user. Renewals are
// distinct rows so we keep an immutable history of period bounds and
// price snapshots. The unique partial index below enforces "at most one
// active row per user" — DB-level guard against double-charging.
export const memberSubscriptions = pgTable(
  "member_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull(),
    priceMyrSen: bigint("price_myr_sen", { mode: "bigint" }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    hitpayRecurringId: text("hitpay_recurring_id"),
    hitpayPaymentId: text("hitpay_payment_id"),
    welcomeGiftDispatched: boolean("welcome_gift_dispatched").notNull().default(false),
    notifiedDays: jsonb("notified_days")
      .notNull()
      .default(sql`'[]'::jsonb`),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("member_subscriptions_user_idx").on(t.userId),
    statusIdx: index("member_subscriptions_status_idx").on(t.status),
    periodEndIdx: index("member_subscriptions_period_end_idx").on(t.periodEnd),
    activeUserUnique: uniqueIndex("member_subscriptions_active_user_unique_idx")
      .on(t.userId)
      .where(sql`status = 'active'`),
    pendingUserUnique: uniqueIndex("member_subscriptions_pending_user_unique_idx")
      .on(t.userId)
      .where(sql`status = 'pending'`),
  }),
)
