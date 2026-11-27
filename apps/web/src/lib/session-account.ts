import { eq } from "drizzle-orm"

import { schema, withTenant, type UserRole } from "@bomy/db"

import { getDb } from "@/lib/db"

/**
 * Does the account behind a (JWT) session still exist?
 *
 * A web JWT lives up to 30 days and is not re-checked against the DB per request, so a deleted
 * account can still present a "signed in" session. Before migration 0041 the checkout flag read
 * wrote an `admin_bypass_audit` row with the session user as actor, and its FK error doubled as
 * this check. That write is gone, so checkout asks explicitly.
 *
 * - Read-only and unaudited: `withTenant` as the session user; RLS `users_self_read` lets a user
 *   read their own row. No `withAdmin`.
 * - "Exists" means only that the `users` row is present. Users have no soft-delete / disabled
 *   state (deletion removes the row), so this matches the old FK check exactly; no new
 *   restriction (role, consent) is added here.
 * - A DB error is NOT treated as "exists": it propagates, so the caller fails like any other DB
 *   error on that path (page error boundary / action throws) and never proceeds as logged in.
 */
export async function sessionAccountExists(session: {
  id: string
  role: UserRole
}): Promise<boolean> {
  const rows = await withTenant(getDb(), { userId: session.id, userRole: session.role }, (tx) =>
    tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, session.id))
      .limit(1),
  )
  return rows.length === 1
}
