import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { brandSubscriptionPlans } from "./brand_subscription_plans.js"
import { subscriptionStatusEnum } from "./enums.js"
import { stores } from "./stores.js"
import { users } from "./users.js"

// Per-buyer brand subscription instance. price/discount are snapshotted
// at purchase so later edits to the plan never mutate active subs (per
// locked decision #8).
//
// Commission rule (locked 2026-05-01): fee is taken off the top, THEN
// the 90/10 split applies. Net = price − hitpay_fee. brand_payout =
// net × 90 %, bomy_commission = net × 10 %. The check constraint below
// enforces brand_payout + bomy_commission + hitpay_fee = price for any
// row in `active` status. Pending rows (created at checkout
// initiation, before the HitPay webhook delivers fee data) carry zero
// values; the webhook handler is the only writer that flips a row to
// active and at that point all three sen columns must be populated.
// `brand_payout_at` is set when an admin triggers the manual payout via
// HitPay Transfers API (Stage 4 keeps payouts admin-driven).
export const brandSubscriptions = pgTable(
  "brand_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => brandSubscriptionPlans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull(),
    priceMyrSen: bigint("price_myr_sen", { mode: "bigint" }).notNull(),
    discountPct: smallint("discount_pct").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    hitpayPaymentRequestId: text("hitpay_payment_request_id"),
    hitpayPaymentId: text("hitpay_payment_id"),
    hitpayFeeSen: bigint("hitpay_fee_sen", { mode: "bigint" }),
    bomyCommissionSen: bigint("bomy_commission_sen", { mode: "bigint" }).notNull(),
    brandPayoutSen: bigint("brand_payout_sen", { mode: "bigint" }).notNull(),
    brandPayoutAt: timestamp("brand_payout_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("brand_subscriptions_user_idx").on(t.userId),
    storeIdx: index("brand_subscriptions_store_idx").on(t.storeId),
    statusIdx: index("brand_subscriptions_status_idx").on(t.status),
    periodEndIdx: index("brand_subscriptions_period_end_idx").on(t.periodEnd),
    splitChk: check(
      "brand_subscriptions_split_chk",
      sql`${t.status} <> 'active'
          OR (
            ${t.hitpayFeeSen} IS NOT NULL
            AND ${t.bomyCommissionSen} + ${t.brandPayoutSen} + ${t.hitpayFeeSen} = ${t.priceMyrSen}
          )`,
    ),
    discountRange: check(
      "brand_subscriptions_discount_chk",
      sql`${t.discountPct} BETWEEN 5 AND 10`,
    ),
    paymentRequestUnique: uniqueIndex("brand_subscriptions_payment_request_unique_idx")
      .on(t.hitpayPaymentRequestId)
      .where(sql`hitpay_payment_request_id IS NOT NULL`),
  }),
)
