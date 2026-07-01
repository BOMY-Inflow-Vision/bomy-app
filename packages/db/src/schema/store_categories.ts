import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { stores } from "./stores.js"

export const storeCategories = pgTable(
  "store_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("store_categories_slug_unique_idx").on(t.slug),
    activeIdx: index("store_categories_active_idx").on(t.isActive),
  }),
)

export const storeCategoryAssignments = pgTable(
  "store_category_assignments",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    storeCategoryId: uuid("store_category_id")
      .notNull()
      .references(() => storeCategories.id, { onDelete: "restrict" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.storeId, t.storeCategoryId] }),
    categoryIdx: index("store_category_assignments_category_idx").on(t.storeCategoryId),
  }),
)
