import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

/**
 * Append-only audit log of every `withAdmin` invocation. Written
 * inside the `withAdmin` transaction itself (see `tenant.ts`) so every
 * RLS bypass leaves a durable, transactional forensic trail.
 *
 * Pattern mirrors `platform_config_audit`:
 *   - `actor_user_id` is nullable with ON DELETE SET NULL so deleting
 *     the actor (or the seeded system user) never erases audit history.
 *   - No UPDATE/DELETE policies — append-only enforced by FORCE RLS
 *     plus omission.
 *   - Indexed on (actor_user_id, created_at) and on created_at alone
 *     for the two expected forensic queries: "what did actor X do"
 *     and "what happened in window [t0, t1]".
 */
export const adminBypassAudit = pgTable(
  "admin_bypass_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index("admin_bypass_audit_actor_idx").on(t.actorUserId, t.createdAt),
    createdAtIdx: index("admin_bypass_audit_created_at_idx").on(t.createdAt),
  }),
)
