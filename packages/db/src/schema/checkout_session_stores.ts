import { sql } from "drizzle-orm"
import { bigint, check, index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { checkoutSessions } from "./checkout_sessions.js"
import { currencyEnum } from "./enums.js"
import { stores } from "./stores.js"

// Per-store rollup row computed at checkout initiation: catalog subtotal,
// brand-subscription discount applied, voucher allocation (proportional,
// last-store-absorbs), and shipping fee snapshot. Read by the PR #32
// webhook fan-out for deterministic order creation.
export const checkoutSessionStores = pgTable(
  "checkout_session_stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    currency: currencyEnum("currency").notNull().default("MYR"),
    retailSubtotalSen: bigint("retail_subtotal_sen", { mode: "bigint" }).notNull(),
    brandDiscountSen: bigint("brand_discount_sen", { mode: "bigint" }).notNull().default(0n),
    discountedSubtotalSen: bigint("discounted_subtotal_sen", { mode: "bigint" }).notNull(),
    voucherContributionSen: bigint("voucher_contribution_sen", { mode: "bigint" })
      .notNull()
      .default(0n),
    shippingFeeSen: bigint("shipping_fee_sen", { mode: "bigint" }).notNull(),
    pspFeeAllocatedSen: bigint("psp_fee_allocated_sen", { mode: "bigint" }).notNull().default(0n),
  },
  (t) => ({
    sessionStoreUnique: uniqueIndex("checkout_session_stores_uniq").on(
      t.checkoutSessionId,
      t.storeId,
    ),
    sessionIdx: index("checkout_session_stores_session_idx").on(t.checkoutSessionId),
    storeIdx: index("checkout_session_stores_store_idx").on(t.storeId),
    retailNonnegChk: check(
      "checkout_session_stores_retail_nonneg_chk",
      sql`retail_subtotal_sen >= 0`,
    ),
    shippingNonnegChk: check(
      "checkout_session_stores_shipping_nonneg_chk",
      sql`shipping_fee_sen >= 0`,
    ),
    brandNonnegChk: check("checkout_session_stores_brand_nonneg_chk", sql`brand_discount_sen >= 0`),
    brandCapChk: check(
      "checkout_session_stores_brand_cap_chk",
      sql`brand_discount_sen <= retail_subtotal_sen`,
    ),
    discountedChk: check(
      "checkout_session_stores_discounted_chk",
      sql`discounted_subtotal_sen = retail_subtotal_sen - brand_discount_sen`,
    ),
    discountedNonnegChk: check(
      "checkout_session_stores_discounted_nonneg_chk",
      sql`discounted_subtotal_sen >= 0`,
    ),
    voucherNonnegChk: check(
      "checkout_session_stores_voucher_nonneg_chk",
      sql`voucher_contribution_sen >= 0`,
    ),
  }),
)
