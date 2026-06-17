import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

export const userConsents = pgTable(
  "user_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "tos" | "privacy" — validated at app layer, text avoids enum churn
    document: text("document").notNull(),
    // platform_config tos_version in force at acceptance time, e.g. "2026-06-17"
    version: text("version").notNull(),
    acceptedIp: text("accepted_ip"),
    acceptedUserAgent: text("accepted_user_agent"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("user_consents_user_idx").on(t.userId),
    // Idempotent re-clicks don't duplicate rows; a new version creates a new row
    userDocVersionUnique: uniqueIndex("user_consents_user_doc_version_unique_idx").on(
      t.userId,
      t.document,
      t.version,
    ),
  }),
)
