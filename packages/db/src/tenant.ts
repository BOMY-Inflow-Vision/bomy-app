import { sql } from "drizzle-orm"

import type { Database } from "./client.js"
import { USER_ROLES, type UserRole } from "./types.js"

export interface TenantContext {
  /** UUID of the authenticated user. */
  userId: string
  /** Role of the authenticated user. */
  userRole: UserRole
  /**
   * Store/seller id, when the operation is seller-scoped. Omit for
   * buyer-scoped or BOMY-admin operations where no single store is in
   * context.
   */
  sellerId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(name: string, value: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`withTenant: ${name} must be a UUID, got: ${value}`)
  }
}

function assertRole(role: string): asserts role is UserRole {
  if (!(USER_ROLES as readonly string[]).includes(role)) {
    throw new Error(`withTenant: userRole must be one of ${USER_ROLES.join("|")}, got: ${role}`)
  }
}

/**
 * Run `fn` inside a transaction with tenant context set.
 *
 * Implements Proposal v2 §7 guardrail #1: every DB access goes through
 * this wrapper, which opens a transaction, sets the three
 * `app.current_*` variables via `set_config(..., is_local=true)`
 * (transaction-scoped — cleared automatically on commit/rollback, no
 * leakage across pool reuse), runs the callback, commits or rolls
 * back, and returns the connection to the pool.
 *
 * RLS policies in `src/rls/policies.sql` key their `USING` clauses on
 * these settings. Code that bypasses `withTenant` will either hit the
 * default-deny policy (returning empty) or — if it's somehow running
 * as a superuser — trigger `app.assert_tenant_context()` which emits
 * `WARNING rls.missing_context` (guardrail #6).
 *
 * `set_config(key, value, true)` is equivalent to `SET LOCAL` — all
 * settings are transaction-scoped and cleared automatically on commit
 * or rollback (guardrail #8). No extra cleanup is needed.
 *
 * Injection safety: `set_config(text, text, bool)` is a regular
 * function call with bound parameters — user-supplied ids never
 * reach the parser as SQL. The UUID regex + role enum check are an
 * extra belt-and-braces guard on top of that.
 */
export async function withTenant<T>(
  db: Database,
  ctx: TenantContext,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  assertUuid("userId", ctx.userId)
  assertRole(ctx.userRole)
  if (ctx.sellerId !== undefined) assertUuid("sellerId", ctx.sellerId)

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`)
    await tx.execute(sql`SELECT set_config('app.current_user_role', ${ctx.userRole}, true)`)
    await tx.execute(sql`SELECT set_config('app.current_seller_id', ${ctx.sellerId ?? ""}, true)`)
    return fn(tx as Database)
  })
}

/**
 * Escape hatch for admin services that legitimately need to see
 * cross-tenant data (reconciliation, ops console, migrations).
 *
 * Runs the callback inside a transaction under an explicit
 * `app.bypass_rls = true` flag (guardrail #3). This flag is paired
 * with RLS policies that allow a row only when either the tenant
 * clause matches OR `app.bypass_rls` is true. Every bypass MUST be
 * audited at the API layer — this helper deliberately takes a
 * `reason` string to make the audit site obvious at the call site.
 *
 * In production, connections that run admin workloads should use the
 * `bomy_admin` DB role (which has `BYPASSRLS` at the role level). For
 * API-layer admin flows against the app role, `app.bypass_rls` is the
 * mechanism.
 */
export async function withAdmin<T>(
  db: Database,
  adminCtx: { userId: string; reason: string },
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  assertUuid("userId", adminCtx.userId)
  if (!adminCtx.reason || adminCtx.reason.trim().length === 0) {
    throw new Error("withAdmin: reason is required for audit trail")
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${adminCtx.userId}, true)`)
    await tx.execute(sql`SELECT set_config('app.current_user_role', 'bomy_admin', true)`)
    await tx.execute(sql`SELECT set_config('app.bypass_rls', 'true', true)`)
    return fn(tx as Database)
  })
}
