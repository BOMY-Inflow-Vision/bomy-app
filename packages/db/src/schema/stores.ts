import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { storeStatusEnum } from "./enums.js"
import { users } from "./users.js"

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: storeStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("stores_slug_unique_idx").on(t.slug),
    ownerIdx: index("stores_owner_idx").on(t.ownerId),
  }),
)
