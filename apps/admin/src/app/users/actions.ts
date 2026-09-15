"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin, type UserRole, USER_ROLES } from "@bomy/db"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"
import { validateUserProfile } from "./user-profile-schema"

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!USER_ROLES.includes(role)) return { ok: false, error: `Invalid role: ${role}` }
  const authz = await authorizeAdminAction({ roles: ["bomy_admin"] })
  if (!authz.ok) return { ok: false, error: authz.error }

  await withAdmin(
    getDb(),
    { userId: authz.adminId, reason: "admin update user role" },
    async (tx) => {
      await tx
        .update(schema.users)
        .set({ role, updatedAt: new Date() })
        .where(eq(schema.users.id, userId))
    },
  )
  revalidatePath("/users")
  return { ok: true }
}

export async function updateUserProfile(
  userId: string,
  input: { name: string; email: string },
): Promise<
  { ok: true } | { ok: false; errors: { name?: string; email?: string; general?: string } }
> {
  const authz = await authorizeAdminAction({ roles: ["bomy_admin"] })
  if (!authz.ok) return { ok: false, errors: { general: authz.error } }
  const adminId = authz.adminId

  const parsed = validateUserProfile(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const { name, email } = parsed.value

  let result: { ok: true } | { ok: false; errors: { email?: string } }
  try {
    result = await withAdmin(
      getDb(),
      { userId: adminId, reason: "admin update user profile" },
      async (tx) => {
        const dup = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(and(sql`lower(${schema.users.email}) = ${email}`, ne(schema.users.id, userId)))
          .limit(1)
        if (dup.length > 0) return { ok: false, errors: { email: "Email already in use" } } as const

        await tx
          .update(schema.users)
          .set({ name, email, updatedAt: new Date() })
          .where(eq(schema.users.id, userId))
        return { ok: true } as const
      },
    )
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") {
      return { ok: false, errors: { email: "Email already in use" } }
    }
    throw e
  }

  if (result.ok) revalidatePath("/users")
  return result
}
