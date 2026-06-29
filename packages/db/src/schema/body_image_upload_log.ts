import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

export const bodyImageUploadLog = pgTable(
  "body_image_upload_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userWindowIdx: index("body_image_upload_log_user_window_idx").on(t.userId, t.createdAt),
  }),
)
