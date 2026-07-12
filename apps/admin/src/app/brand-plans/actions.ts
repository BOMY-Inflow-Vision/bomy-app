"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"

export async function togglePlanActive(planId: string, isActive: boolean) {
  const adminId = await requireAdminId()
  await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin toggle brand plan active" },
    async (tx) => {
      await tx
        .update(schema.brandSubscriptionPlans)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(schema.brandSubscriptionPlans.id, planId))
    },
  )
  revalidatePath("/brand-plans")
}
