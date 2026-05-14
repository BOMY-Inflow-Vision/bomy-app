import { customType, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { productStatusEnum } from "./enums.js"
import { categories } from "./categories.js"
import { stores } from "./stores.js"

// tsvector is a Postgres full-text search type. Represented here as a
// read-only custom type — the DB generates and maintains the column value
// via GENERATED ALWAYS AS in the migration. Never insert into this column.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector"
  },
})

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // DB-generated tsvector: GENERATED ALWAYS AS to_tsvector('english', ...) STORED.
    // Read-only from the application — used only in WHERE clauses for FTS.
    searchVector: tsvector("search_vector"),
    status: productStatusEnum("status").notNull().default("draft"),
    coverImageUrl: text("cover_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeSlugUnique: uniqueIndex("products_store_slug_unique_idx").on(t.storeId, t.slug),
    storeStatusIdx: index("products_store_status_idx").on(t.storeId, t.status),
    searchVectorGin: index("products_search_vector_gin_idx").using("gin", t.searchVector),
  }),
)
