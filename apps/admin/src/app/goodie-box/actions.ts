"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"
import { flashToast } from "@/lib/flash-toast-server"

// Server-form trigger (no client JS runs after submit) — must not throw for an expected
// failure; flashes a toast for both outcomes itself instead of returning a result.
export async function markDispatched(dispatchId: string, formData: FormData): Promise<void> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }

  const trackingNumber = (formData.get("trackingNumber") as string | null)?.trim()
  if (!trackingNumber) {
    await flashToast("error", "Tracking number is required.")
    return
  }

  try {
    await withAdmin(
      getDb(),
      { userId: authz.adminId, reason: "admin mark goodie box dispatched" },
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
  } catch (err) {
    let message = "Could not mark as dispatched."
    if (err instanceof Error && err.message === "Dispatch not found") {
      message = "Dispatch not found."
    } else if (err instanceof Error && err.message.startsWith("Cannot dispatch:")) {
      message = `${err.message}.`
    }
    await flashToast("error", message)
    return
  }

  revalidatePath("/goodie-box")
  await flashToast("success", "Marked dispatched.")
}
