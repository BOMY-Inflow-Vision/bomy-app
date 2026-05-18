import { sql } from "drizzle-orm"
import { bigint, check, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { currencyEnum } from "./enums.js"
import { orders } from "./orders.js"
import { productVariants } from "./product_variants.js"
import { stores } from "./stores.js"

// One row per cart line within an order. Snapshots product + variant at
// fan-out time so later catalog edits do not mutate the order record.
// variantId is nullable so the row survives variant deletion.
// CHECKs owned by migration 0012; mirrored here for documentation.
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    currency: currencyEnum("currency").notNull().default("MYR"),
    productSnapshot: jsonb("product_snapshot").notNull(),
    variantSnapshot: jsonb("variant_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceSen: bigint("unit_price_sen", { mode: "bigint" }).notNull(),
    lineTotalSen: bigint("line_total_sen", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("order_items_quantity_pos", sql`${t.quantity} > 0`),
    check("order_items_line_total_chk", sql`${t.lineTotalSen} = ${t.quantity} * ${t.unitPriceSen}`),
  ],
)
