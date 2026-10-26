import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { products } from "./products.js"

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    // Seller-ticked (migration 0034): this picture is a cut-out. The cover picture's flag is cached on products.cover_is_cutout.
    isCutout: boolean("is_cutout").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("product_images_product_idx").on(t.productId),
  }),
)
