import type { UserRole } from "@bomy/db"
import type { Session } from "next-auth"

export function requireRole(session: Session | null, roles: UserRole[]): string {
  if (!session) throw new Error("UNAUTHENTICATED")
  const role = (session.user as typeof session.user & { role?: UserRole }).role
  if (!roles.includes(role)) {
    throw new Error("FORBIDDEN")
  }
  return session.user.id
}
