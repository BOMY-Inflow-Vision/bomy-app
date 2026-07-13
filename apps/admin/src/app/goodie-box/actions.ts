"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"

export async function markDispatched(dispatchId: string, formData: FormData) {
  const trackingNumber = (formData.get("trackingNumber") as string | null)?.trim()
  if (!trackingNumber) throw new Error("Tracking number is required")

  const adminId = await requireAdminId()
  await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin mark goodie box dispatched" },
    async (tx) => {
      const [existing] = await tx
        .select({ status: schema.goodieBoxDispatches.status })
        .from(schema.goodieBoxDispatches)
        .where(eq(schema.goodieBoxDispatches.id, dispatchId))
        .limit(1)
      if (!existing) throw new Error("Dispatch not found")
      if (existing.status !== "pending")
        throw new Error(`Cannot dispatch: already '${existing.status}'`)
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
