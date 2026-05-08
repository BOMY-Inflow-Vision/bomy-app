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

export async function markDispatched(dispatchId: string, formData: FormData) {
  const trackingNumber = (formData.get("trackingNumber") as string | null)?.trim()
  if (!trackingNumber) throw new Error("Tracking number is required")

  const adminId = await getAdminId()
  await withAdmin(
    db,
    { userId: adminId, reason: "admin mark goodie box dispatched" },
    async (tx) => {
      await tx
        .update(schema.goodieBoxDispatches)
        .set({
          trackingNumber,
          dispatchedAt: new Date(),
          status: "dispatched",
          updatedAt: new Date(),
        })
        .where(eq(schema.goodieBoxDispatches.id, dispatchId))
    },
  )
  revalidatePath("/goodie-box")
}
