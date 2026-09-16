import type { UserRole } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"

export type AuthorizeAdminActionResult =
  | { ok: true; adminId: string }
  | { ok: false; error: string }

// Shared auth wrapper for Server Actions in the toast-enabled surfaces: production redacts
// thrown Server Action error messages, so an action whose failure must be shown specifically
// (e.g. a demoted admin) needs a typed result instead of a throw. Wraps requireAdminId (the
// existing action-gate in src/lib/auth.ts, left unmodified) and maps its two thrown error
// codes to short, specific, user-facing copy; anything else rethrows since it's unexpected.
export async function authorizeAdminAction(
  opts: { roles?: readonly UserRole[] } = {},
): Promise<AuthorizeAdminActionResult> {
  try {
    const adminId = await requireAdminId(opts)
    return { ok: true, adminId }
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { ok: false, error: "Your session has ended. Please sign in again." }
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return { ok: false, error: "You don't have permission to do that." }
    }
    throw err
  }
}
