import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

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
    excerpt: text("excerpt"),
    status: storeStatusEnum("status").notNull().default("pending"),
    // Seller-set flat shipping fee per order, snapshotted into
    // checkout_session_stores.shipping_fee_sen at checkout initiation
    // and copied to orders.shipping_fee_sen at webhook fan-out (PR #32).
    // No commission on shipping. Seller-edit UI ships in PR #33.
    flatShippingFeeSen: bigint("flat_shipping_fee_sen", { mode: "bigint" }).notNull().default(0n),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("stores_slug_unique_idx").on(t.slug),
    ownerIdx: index("stores_owner_idx").on(t.ownerId),
  }),
)
