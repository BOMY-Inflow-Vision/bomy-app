import { redirect } from "next/navigation"
import type { Session } from "next-auth"

import { BOMY_ADMIN_ROLES, type UserRole } from "@bomy/db"

import { auth } from "@/auth"

function roleOf(session: Session | null): UserRole | undefined {
  return (session?.user as (Session["user"] & { role?: UserRole }) | undefined)?.role
}

// Page gate: resolves the session (triggering the jwt role refresh), then
// redirects to /unauthorized unless the fresh role is in the allow-list.
export async function requireAdmin(
  opts: { roles?: readonly UserRole[] } = {},
): Promise<{ id: string; role: UserRole }> {
  const roles = opts.roles ?? BOMY_ADMIN_ROLES
  const session = await auth()
  const role = roleOf(session)
  if (!session?.user?.id || session.roleRefreshFailed === true || !role || !roles.includes(role)) {
    redirect("/unauthorized")
  }
  return { id: session.user.id, role }
}

// Action gate: same enforcement, but throws (matches the existing action contract).
export async function requireAdminId(opts: { roles?: readonly UserRole[] } = {}): Promise<string> {
  const roles = opts.roles ?? BOMY_ADMIN_ROLES
  const session = await auth()
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED")
  const role = roleOf(session)
  if (session.roleRefreshFailed === true || !role || !roles.includes(role)) {
    throw new Error("FORBIDDEN")
  }
  return session.user.id
}
