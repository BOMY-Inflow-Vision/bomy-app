import {
  boolean,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

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
    // Which part of the picture stays in view when the square tile crops it, in percent across and
    // down (migration 0037; 50 / 50 = centre). The cover's copy is cached on products.cover_focal_x / _y.
    focalX: smallint("focal_x").notNull().default(50),
    focalY: smallint("focal_y").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("product_images_product_idx").on(t.productId),
  }),
)
