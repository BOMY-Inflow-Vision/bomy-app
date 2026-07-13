import type { UserRole } from "@bomy/db"

export const STALE_MS = 5 * 60 * 1000

export interface RoleToken {
  id?: string
  // Standard Auth.js subject claim. The session callback falls back to it when
  // the custom `id` claim is absent, so re-derivation must key on it too.
  sub?: string
  role?: UserRole
  roleCheckedAt?: number
  roleRefreshFailed?: boolean
}

export interface RefreshDeps {
  now: number
  lookupRole: (userId: string) => Promise<UserRole | null>
}

// Re-derives the admin role from the DB when the token's role is older than
// STALE_MS. Fail-closed: transient errors leave durable claims intact and mark
// the request failed; only a missing user row durably demotes to "buyer".
export async function refreshRole(token: RoleToken, deps: RefreshDeps): Promise<RoleToken> {
  const { now, lookupRole } = deps
  const next: RoleToken = { ...token, roleRefreshFailed: false }

  const userId = next.id ?? next.sub
  if (!userId) return next

  const checkedAt = typeof next.roleCheckedAt === "number" ? next.roleCheckedAt : undefined
  const fresh = checkedAt !== undefined && now - checkedAt <= STALE_MS
  if (fresh) return next

  try {
    const role = await lookupRole(userId)
    if (role === null) {
      next.role = "buyer"
    } else {
      next.role = role
    }
    next.roleCheckedAt = now
    return next
  } catch (err) {
    // Log a sanitized message only — a raw driver error can carry connection
    // details (DSN fragments) that should not land in admin logs.
    const message = err instanceof Error ? err.message : String(err)
    console.warn("[admin] role refresh failed; failing closed for this request:", message)
    next.roleRefreshFailed = true
    return next
  }
}
