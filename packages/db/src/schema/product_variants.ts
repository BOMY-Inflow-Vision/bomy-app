import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export type FulfillmentMode = "normal" | "backorder" | "preorder"

import { products } from "./products.js"

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    priceMyrSen: bigint("price_myr_sen", { mode: "bigint" }).notNull(),
    stockCount: integer("stock_count").notNull().default(0),
    attributes: jsonb("attributes")
      .notNull()
      .default(sql`'{}'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    fulfillmentMode: text("fulfillment_mode").notNull().default("normal"),
    preorderLeadDays: integer("preorder_lead_days"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("product_variants_product_idx").on(t.productId),
    skuUnique: uniqueIndex("product_variants_sku_unique_idx")
      .on(t.sku)
      .where(sql`sku IS NOT NULL`),
    priceChk: check("product_variants_price_chk", sql`${t.priceMyrSen} > 0`),
    stockChk: check("product_variants_stock_chk", sql`${t.stockCount} >= 0`),
    fulfillmentModeChk: check(
      "product_variants_fulfillment_mode_chk",
      sql`${t.fulfillmentMode} IN ('normal', 'backorder', 'preorder')`,
    ),
  }),
)
