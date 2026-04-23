import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { userRoleEnum } from "./enums.js"

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("buyer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique_idx").on(t.email),
  }),
)
