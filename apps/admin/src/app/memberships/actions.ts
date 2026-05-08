"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { HitPayClient } from "@bomy/hitpay"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

async function getAdminId() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  return session.user.id
}

function hitpayClient() {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  if (!apiKey) throw new Error("HITPAY_API_KEY is required")
  if (!apiUrl) throw new Error("HITPAY_API_URL is required")
  return new HitPayClient({ apiKey, baseUrl: apiUrl })
}

// Cancel HitPay recurring billing first (if present); only set cancelledAt on success.
// If no hitpayRecurringId, set cancelledAt directly (manual/test subscription).
export async function cancelMembership(subId: string) {
  const adminId = await getAdminId()
  await withAdmin(getDb(), { userId: adminId, reason: "admin cancel membership" }, async (tx) => {
    const [sub] = await tx
      .select({
        id: schema.memberSubscriptions.id,
        hitpayRecurringId: schema.memberSubscriptions.hitpayRecurringId,
      })
      .from(schema.memberSubscriptions)
      .where(eq(schema.memberSubscriptions.id, subId))
      .limit(1)
    if (!sub) throw new Error("Subscription not found")
    if (sub.hitpayRecurringId) {
      await hitpayClient().cancelRecurringBilling(sub.hitpayRecurringId)
    }
    await tx
      .update(schema.memberSubscriptions)
      .set({ cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.memberSubscriptions.id, subId))
  })
  revalidatePath("/memberships")
}
