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

import { currencyEnum, duplicateChargeStatusEnum, pspProviderEnum } from "./enums.js"

/**
 * One row per duplicate subscription charge — a payment received for an
 * entitlement we will not honour (abandoned-checkout re-pay, or a HitPay
 * recurring charge on an already-active membership). The HitPay webhook
 * inserts on detection; an admin issues a refund; the refund webhook clears it.
 *
 * `subscription_id` is polymorphic (member_subscriptions OR brand_subscriptions),
 * so it carries no FK. `user_id` is a denormalised snapshot (no FK) so the record
 * survives user deletion. `hitpay_payment_id` is unique — the idempotency anchor
 * for HitPay rows.
 *
 * Migration 0039 added provider-neutral columns (Stripe design §4.2): `psp_provider`
 * (pinned at insert), `psp_payment_id` / `psp_refund_id` (unique per provider) and
 * `psp_fee_sen` (Stripe keeps its fee on refund). `hitpay_payment_id` is now nullable
 * because Stripe rows have none; `duplicate_charges_payment_ref_chk` requires at
 * least one of the two payment ids. `psp_payment_id` becomes NOT NULL in the later
 * contract migration.
 */
export const duplicateCharges = pgTable(
  "duplicate_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionType: text("subscription_type").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    userId: uuid("user_id").notNull(),
    hitpayPaymentId: text("hitpay_payment_id"),
    amountSen: bigint("amount_sen", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    status: duplicateChargeStatusEnum("status").notNull().default("detected"),
    hitpayRefundId: text("hitpay_refund_id"),
    pspProvider: pspProviderEnum("psp_provider").notNull().default("hitpay"),
    pspPaymentId: text("psp_payment_id"),
    pspRefundId: text("psp_refund_id"),
    pspFeeSen: bigint("psp_fee_sen", { mode: "bigint" }),
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
    pspPaymentUnique: uniqueIndex("duplicate_charges_psp_payment_unique_idx")
      .on(t.pspProvider, t.pspPaymentId)
      .where(sql`${t.pspPaymentId} IS NOT NULL`),
    pspRefundUnique: uniqueIndex("duplicate_charges_psp_refund_unique_idx")
      .on(t.pspProvider, t.pspRefundId)
      .where(sql`${t.pspRefundId} IS NOT NULL`),
    statusIdx: index("duplicate_charges_status_idx").on(t.status),
    amountPositive: check("duplicate_charges_amount_positive_chk", sql`${t.amountSen} > 0`),
    subTypeChk: check(
      "duplicate_charges_subscription_type_chk",
      sql`${t.subscriptionType} IN ('member_subscription','brand_subscription')`,
    ),
    paymentRefChk: check(
      "duplicate_charges_payment_ref_chk",
      sql`${t.hitpayPaymentId} IS NOT NULL OR ${t.pspPaymentId} IS NOT NULL`,
    ),
  }),
)
