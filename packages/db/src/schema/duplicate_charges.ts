import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { currencyEnum, duplicateChargeStatusEnum } from "./enums.js"

/**
 * One row per duplicate subscription charge — a payment received for an
 * entitlement we will not honour (abandoned-checkout re-pay, or a HitPay
 * recurring charge on an already-active membership). The HitPay webhook
 * inserts on detection; an admin issues a refund; the refund webhook clears it.
 *
 * `subscription_id` is polymorphic (member_subscriptions OR brand_subscriptions),
 * so it carries no FK. `user_id` is a denormalised snapshot (no FK) so the record
 * survives user deletion. `hitpay_payment_id` is unique — the idempotency anchor.
 */
export const duplicateCharges = pgTable(
  "duplicate_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionType: text("subscription_type").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    userId: uuid("user_id").notNull(),
    hitpayPaymentId: text("hitpay_payment_id").notNull(),
    amountSen: bigint("amount_sen", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    status: duplicateChargeStatusEnum("status").notNull().default("detected"),
    hitpayRefundId: text("hitpay_refund_id"),
    resolvedBy: uuid("resolved_by"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    paymentUnique: uniqueIndex("duplicate_charges_hitpay_payment_id_unique_idx").on(
      t.hitpayPaymentId,
    ),
    refundUnique: uniqueIndex("duplicate_charges_hitpay_refund_id_unique_idx")
      .on(t.hitpayRefundId)
      .where(sql`${t.hitpayRefundId} IS NOT NULL`),
    statusIdx: index("duplicate_charges_status_idx").on(t.status),
    amountPositive: check("duplicate_charges_amount_positive_chk", sql`${t.amountSen} > 0`),
    subTypeChk: check(
      "duplicate_charges_subscription_type_chk",
      sql`${t.subscriptionType} IN ('member_subscription','brand_subscription')`,
    ),
  }),
)
