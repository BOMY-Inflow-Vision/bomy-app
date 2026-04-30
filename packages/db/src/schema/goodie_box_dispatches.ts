import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { dispatchStatusEnum } from "./enums.js"
import { users } from "./users.js"

// Quarterly Goodie Box dispatch row. One per active #1 member per
// quarter. `shipping_name` and `shipping_address` are snapshotted from
// the member's profile at dispatch-list generation time so a later
// profile edit does not retroactively change a fulfilled shipment.
// `tracking_number` and `dispatched_at` are populated post-handoff to
// Pos Laju via the admin UI.
export const goodieBoxDispatches = pgTable(
  "goodie_box_dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    quarter: text("quarter").notNull(),
    status: dispatchStatusEnum("status").notNull().default("pending"),
    shippingName: text("shipping_name").notNull(),
    shippingAddress: jsonb("shipping_address").notNull(),
    trackingNumber: text("tracking_number"),
    carrier: text("carrier").notNull().default("pos_laju"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userQuarterUnique: uniqueIndex("goodie_box_dispatches_user_quarter_unique_idx").on(
      t.userId,
      t.quarter,
    ),
    statusIdx: index("goodie_box_dispatches_status_idx").on(t.status),
    quarterFmt: check(
      "goodie_box_dispatches_quarter_fmt_chk",
      sql`${t.quarter} ~ '^[0-9]{4}-Q[1-4]$'`,
    ),
  }),
)
