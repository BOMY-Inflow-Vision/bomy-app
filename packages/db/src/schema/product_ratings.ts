// packages/db/src/schema/product_ratings.ts
// Mirrors migration 0035. Constraints, RLS, grants and the products rating-column trigger are
// owned by migration 0035 (hand-written SQL); this file only describes the shape for Drizzle.
import { sql } from "drizzle-orm"
import { check, index, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { products } from "./products.js"
import { users } from "./users.js"

export const productRatings = pgTable(
  "product_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // RESTRICT (repo convention, as in 0032): a future account-erasure flow must handle
    // ratings deliberately.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    stars: smallint("stars").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete by bomy_ops / bomy_admin. A removed rating is excluded from the aggregate and
    // still blocks the same buyer from rating the product again (the UNIQUE keeps the row).
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => users.id, { onDelete: "restrict" }),
    removalReason: text("removal_reason"),
  },
  (t) => ({
    productIdx: index("product_ratings_product_idx").on(t.productId),
    productUserUnique: unique("product_ratings_product_user_unique").on(t.productId, t.userId),
    starsChk: check("product_ratings_stars_chk", sql`${t.stars} BETWEEN 1 AND 5`),
    removedPairChk: check(
      "product_ratings_removed_pair_chk",
      sql`(${t.removedAt} IS NULL) = (${t.removedBy} IS NULL)`,
    ),
  }),
)
