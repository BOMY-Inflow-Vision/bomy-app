import { sql } from "drizzle-orm"
import { bigint, check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { checkoutSessions } from "./checkout_sessions.js"
import { currencyEnum, orderFulfilmentStatusEnum, orderPaymentStatusEnum } from "./enums.js"
import { stores } from "./stores.js"
import { users } from "./users.js"

// Stage 5 PR #32. One row per (checkout_session × store) created by the
// HitPay webhook fan-out. All financial fields are bigint sen (Hard
// Constraint §12.1). The journal-balance CHECK is the load-bearing
// invariant — ledger correctness depends on it holding for every row.
//
// RLS: buyer sees own; seller_owner sees own store's; staff sees all.
// Both tenant branches are role-gated (Bob B2). All writes admin-bypass
// only — webhook fan-out runs inside withAdmin. See migration 0012
// + packages/db/src/rls/policies.sql for the authoritative policy block.
//
// CHECKs are owned by the migration; the `check()` calls here mirror them
// for type-level documentation only — truth is in 0012.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: currencyEnum("currency").notNull().default("MYR"),
    shippingAddress: jsonb("shipping_address").notNull(),
    shippingFeeSen: bigint("shipping_fee_sen", { mode: "bigint" }).notNull(),
    retailSubtotalSen: bigint("retail_subtotal_sen", { mode: "bigint" }).notNull(),
    brandDiscountSen: bigint("brand_discount_sen", { mode: "bigint" }).notNull().default(0n),
    discountedSubtotalSen: bigint("discounted_subtotal_sen", { mode: "bigint" }).notNull(),
    voucherContributionSen: bigint("voucher_contribution_sen", { mode: "bigint" })
      .notNull()
      .default(0n),
    pspFeeAllocatedSen: bigint("psp_fee_allocated_sen", { mode: "bigint" }).notNull().default(0n),
    // bomy_commission_sen is intentionally not range-constrained: voucher
    // contributions can push it negative when BOMY's marketing spend
    // exceeds the per-order commission share. Journal balance still holds.
    bomyCommissionSen: bigint("bomy_commission_sen", { mode: "bigint" }).notNull(),
    bomyCommissionPct: integer("bomy_commission_pct").notNull(),
    sellerPayoutSen: bigint("seller_payout_sen", { mode: "bigint" }).notNull(),
    paymentStatus: orderPaymentStatusEnum("payment_status").notNull().default("pending"),
    fulfilmentStatus: orderFulfilmentStatusEnum("fulfilment_status")
      .notNull()
      .default("processing"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    refundRequestedAt: timestamp("refund_requested_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundAmountSen: bigint("refund_amount_sen", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "orders_journal_balance",
      sql`${t.sellerPayoutSen} + ${t.bomyCommissionSen} + ${t.pspFeeAllocatedSen} = ${t.discountedSubtotalSen} + ${t.shippingFeeSen} - ${t.voucherContributionSen}`,
    ),
    check(
      "orders_discounted_check",
      sql`${t.discountedSubtotalSen} = ${t.retailSubtotalSen} - ${t.brandDiscountSen}`,
    ),
    check("orders_commission_pct_range", sql`${t.bomyCommissionPct} BETWEEN 0 AND 100`),
    check("orders_retail_nneg", sql`${t.retailSubtotalSen} >= 0`),
    check("orders_shipping_nneg", sql`${t.shippingFeeSen} >= 0`),
    check("orders_brand_discount_nneg", sql`${t.brandDiscountSen} >= 0`),
    check("orders_brand_lte_retail", sql`${t.brandDiscountSen} <= ${t.retailSubtotalSen}`),
    check("orders_discounted_nneg", sql`${t.discountedSubtotalSen} >= 0`),
    check("orders_voucher_nneg", sql`${t.voucherContributionSen} >= 0`),
  ],
)
