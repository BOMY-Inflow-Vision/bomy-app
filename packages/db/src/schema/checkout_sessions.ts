import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { checkoutSessionStatusEnum, currencyEnum, pspProviderEnum } from "./enums.js"
import { users } from "./users.js"
import { vouchers } from "./vouchers.js"

// Stage 5 PR #31. Buyer-facing checkout session: created at /checkout
// initiation, reserves stock + voucher, redirects to HitPay. Promoted to
// `paid` by the PR #32 webhook fan-out which also creates the orders.
//
// RLS: buyer SELECT own; staff SELECT all; all writes admin-bypass only.
// See migration 0011 + packages/db/src/rls/policies.sql for policies.
//
// CHECK constraints are owned by the migration (Drizzle's `check()` helper
// is mirrored here for type-level documentation only; truth is in 0011).
export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: currencyEnum("currency").notNull().default("MYR"),
    status: checkoutSessionStatusEnum("status").notNull().default("pending_payment"),
    pspProvider: pspProviderEnum("psp_provider").notNull().default("hitpay"),
    pspPaymentRequestId: text("psp_payment_request_id"),
    pspPaymentId: text("psp_payment_id"),
    pspPaymentUrl: text("psp_payment_url"),
    pspFeeSen: bigint("psp_fee_sen", { mode: "bigint" }).notNull().default(0n),
    shippingAddress: jsonb("shipping_address").notNull(),
    totalCatalogSen: bigint("total_catalog_sen", { mode: "bigint" }).notNull(),
    totalShippingSen: bigint("total_shipping_sen", { mode: "bigint" }).notNull(),
    voucherId: uuid("voucher_id").references(() => vouchers.id, { onDelete: "set null" }),
    voucherDiscountSen: bigint("voucher_discount_sen", { mode: "bigint" }).notNull().default(0n),
    brandDiscountTotalSen: bigint("brand_discount_total_sen", { mode: "bigint" })
      .notNull()
      .default(0n),
    totalBuyerPaysSen: bigint("total_buyer_pays_sen", { mode: "bigint" }).notNull(),
    paymentReviewReason: text("payment_review_reason"),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("checkout_sessions_user_idx").on(t.userId),
    userPendingIdx: index("checkout_sessions_user_pending_idx")
      .on(t.userId, t.status)
      .where(sql`status = 'pending_payment'`),
    pspRequestUnique: uniqueIndex("checkout_sessions_psp_payment_request_unique_idx")
      .on(t.pspPaymentRequestId)
      .where(sql`psp_payment_request_id IS NOT NULL`),
    pspPaymentIdUnique: uniqueIndex("checkout_sessions_psp_payment_id_unique_idx")
      .on(t.pspPaymentId)
      .where(sql`psp_payment_id IS NOT NULL`),
    statusExpiresIdx: index("checkout_sessions_status_expires_idx").on(t.status, t.expiresAt),
    paymentReviewReasonChk: check(
      "checkout_sessions_payment_review_reason_chk",
      sql`payment_review_reason IS NULL OR payment_review_reason IN
          ('amount_mismatch', 'invalid_commission_config', 'voucher_claim_failed')`,
    ),
    reviewStateChk: check(
      "checkout_sessions_review_state_chk",
      sql`status NOT IN ('payment_review_required', 'payment_review_resolved')
          OR payment_review_reason IS NOT NULL`,
    ),
    voucherBrandXorChk: check(
      "checkout_sessions_voucher_brand_xor_chk",
      sql`NOT (voucher_discount_sen > 0 AND brand_discount_total_sen > 0)`,
    ),
    totalDerivedChk: check(
      "checkout_sessions_total_derived_chk",
      sql`total_buyer_pays_sen =
          total_catalog_sen + total_shipping_sen
          - voucher_discount_sen - brand_discount_total_sen`,
    ),
    totalPositiveChk: check("checkout_sessions_total_positive_chk", sql`total_buyer_pays_sen > 0`),
    voucherCapChk: check(
      "checkout_sessions_voucher_cap_chk",
      sql`voucher_discount_sen <= total_catalog_sen`,
    ),
  }),
)
