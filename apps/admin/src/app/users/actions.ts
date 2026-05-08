"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin, type UserRole, USER_ROLES } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

export async function updateUserRole(userId: string, role: UserRole) {
  if (!USER_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`)
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin update user role" },
    async (tx) => {
      await tx
        .update(schema.users)
        .set({ role, updatedAt: new Date() })
        .where(eq(schema.users.id, userId))
    },
  )
  revalidatePath("/users")
}
