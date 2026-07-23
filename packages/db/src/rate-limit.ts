import { sql } from "drizzle-orm"

import type { Database } from "./client.js"
import { actionRateLimits } from "./schema/action_rate_limits.js"
import { withTenant } from "./tenant.js"
import type { UserRole } from "./types.js"

export interface RateLimitConfig {
  /** Max allowed calls to this action within the window. */
  max: number
  /** Fixed window size, in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  count: number
  max: number
}

/**
 * Fixed-window per-user rate limit backed by Postgres (GAPS #3 — web server
 * actions have no shared Redis; apps/api's own limiter can't reach these
 * calls since they never go through Fastify).
 *
 * `windowStart` buckets `Date.now()` to a fixed boundary, then a single
 * `INSERT ... ON CONFLICT DO UPDATE` atomically increments-or-creates the
 * row and returns the post-increment count — so two concurrent requests in
 * the same window both land on a consistent count instead of racing a
 * read-then-write. The row always increments, even on a rejected call, so
 * hammering the limit doesn't buy a fresh look at the boundary.
 *
 * Call this FIRST in a server action, before any other DB work — the same
 * "gate before side effects" idiom `submitSellerInquiry` and the magic-link
 * action already use for their own pre-checks.
 */
export async function checkActionRateLimit(
  db: Database,
  ctx: { userId: string; userRole: UserRole },
  action: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(Date.now() / config.windowMs) * config.windowMs)

  return withTenant(db, ctx, async (tx) => {
    const [row] = await tx
      .insert(actionRateLimits)
      .values({ userId: ctx.userId, action, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [actionRateLimits.userId, actionRateLimits.action, actionRateLimits.windowStart],
        set: { count: sql`${actionRateLimits.count} + 1` },
      })
      .returning({ count: actionRateLimits.count })

    if (!row) throw new Error("checkActionRateLimit: upsert returned no row")
    return { allowed: row.count <= config.max, count: row.count, max: config.max }
  })
}
