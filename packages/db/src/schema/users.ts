import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { userRoleEnum } from "./enums.js"

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    // OAuth avatar URL. Populated by NextAuth adapter on sign-in.
    image: text("image"),
    // Null until the user verifies their email address (or signs in via OAuth,
    // which auto-verifies). Required by NextAuth Drizzle adapter.
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    role: userRoleEnum("role").notNull().default("buyer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique_idx").on(t.email),
  }),
)
