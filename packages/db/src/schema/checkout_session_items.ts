import { sql } from "drizzle-orm"
import { bigint, check, index, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { checkoutSessions } from "./checkout_sessions.js"
import { currencyEnum } from "./enums.js"
import { productVariants } from "./product_variants.js"
import { stores } from "./stores.js"

// One row per cart line. Snapshots product + variant at checkout-initiation
// time so later catalog edits don't mutate the order record. variantId is
// nullable so the row survives variant deletion (rare, but possible).
export const checkoutSessionItems = pgTable(
  "checkout_session_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    productSnapshot: jsonb("product_snapshot").notNull(),
    variantSnapshot: jsonb("variant_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    currency: currencyEnum("currency").notNull().default("MYR"),
    unitPriceSen: bigint("unit_price_sen", { mode: "bigint" }).notNull(),
    lineTotalSen: bigint("line_total_sen", { mode: "bigint" }).notNull(),
    brandDiscountSen: bigint("brand_discount_sen", { mode: "bigint" }).notNull().default(0n),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("checkout_session_items_session_idx").on(t.checkoutSessionId),
    sessionStoreIdx: index("checkout_session_items_session_store_idx").on(
      t.checkoutSessionId,
      t.storeId,
    ),
    variantIdx: index("checkout_session_items_variant_idx").on(t.variantId),
    storeIdx: index("checkout_session_items_store_idx").on(t.storeId),
    qtyChk: check("checkout_session_items_qty_chk", sql`quantity > 0`),
    lineTotalChk: check(
      "checkout_session_items_line_total_chk",
      sql`line_total_sen = quantity * unit_price_sen`,
    ),
  }),
)
