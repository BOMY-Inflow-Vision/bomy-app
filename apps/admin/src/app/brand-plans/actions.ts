"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"
import { flashToast } from "@/lib/flash-toast-server"

// Server-form trigger (no client JS runs after submit) — must not throw for an expected
// failure; flashes a toast for both outcomes itself instead of returning a result.
export async function togglePlanActive(planId: string, isActive: boolean): Promise<void> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }

  try {
    await withAdmin(
      getDb(),
      { userId: authz.adminId, reason: "admin toggle brand plan active" },
      async (tx) => {
        await tx
          .update(schema.brandSubscriptionPlans)
          .set({ isActive, updatedAt: new Date() })
          .where(eq(schema.brandSubscriptionPlans.id, planId))
      },
    )
  } catch {
    await flashToast("error", "Could not update plan.")
    return
  }

  revalidatePath("/brand-plans")
  await flashToast("success", isActive ? "Plan activated." : "Plan deactivated.")
}
