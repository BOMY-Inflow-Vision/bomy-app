"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

async function getAdminId() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  return session.user.id
}

export async function cancelMembership(subId: string) {
  const adminId = await getAdminId()
  await withAdmin(db, { userId: adminId, reason: "admin cancel membership" }, async (tx) => {
    await tx
      .update(schema.memberSubscriptions)
      .set({ cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.memberSubscriptions.id, subId))
  })
  revalidatePath("/memberships")
}
