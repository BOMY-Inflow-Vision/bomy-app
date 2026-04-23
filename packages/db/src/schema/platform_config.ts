import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

// Key/value registry for every admin-configurable platform parameter
// (Proposal v2 §18). Nothing is hardcoded: #1 price, commission rates,
// FX thresholds, referral caps, gamification thresholds etc. all live
// here and are read by the application at runtime.
export const platformConfig = pgTable(
  "platform_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    description: text("description"),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyUnique: uniqueIndex("platform_config_key_unique_idx").on(t.key),
  }),
)

// Append-only audit log. Per §18 every config change writes here with
// who/what/when/old→new. Retained independently of platform_config so
// deletions (if ever allowed) don't erase the audit trail — `key` is
// denormalised for that reason.
export const platformConfigAudit = pgTable(
  "platform_config_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configId: uuid("config_id").references(() => platformConfig.id, {
      onDelete: "set null",
    }),
    key: text("key").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyIdx: index("platform_config_audit_key_idx").on(t.key),
    changedAtIdx: index("platform_config_audit_changed_at_idx").on(t.changedAt),
  }),
)
