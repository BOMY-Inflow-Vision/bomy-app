import { pgTable, integer, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

// Fixed-window per-user throttle for Next.js server actions (GAPS #3 — web
// has no shared Redis, unlike apps/api's rate limiter). One row per
// (user, action, window); `count` increments atomically via
// INSERT ... ON CONFLICT DO UPDATE in checkActionRateLimit (packages/db/src/
// rate-limit.ts). Row-per-window means old rows accumulate — pruning is a
// follow-up, not required for correctness (the PK keeps the table narrow
// per user/action; only long-lived unpruned windows are stale weight).
export const actionRateLimits = pgTable(
  "action_rate_limits",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.action, t.windowStart] }),
  }),
)
