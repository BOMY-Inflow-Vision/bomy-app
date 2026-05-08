"use server"

import { and, eq, isNull } from "drizzle-orm"
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

export async function cancelMembership(subId: string) {
  const adminId = await getAdminId()

  // Fetch subscription outside the write transaction so the connection
  // is not held open during the HitPay HTTP call.
  const [sub] = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin read membership for cancel" },
    async (tx) =>
      tx
        .select({
          id: schema.memberSubscriptions.id,
          status: schema.memberSubscriptions.status,
          cancelledAt: schema.memberSubscriptions.cancelledAt,
          hitpayRecurringId: schema.memberSubscriptions.hitpayRecurringId,
        })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.id, subId))
        .limit(1),
  )

  if (!sub) throw new Error("Subscription not found")
  if (sub.status !== "active" || sub.cancelledAt !== null)
    throw new Error(`Cannot cancel: subscription is '${sub.status}'`)

  if (sub.hitpayRecurringId) {
    await hitpayClient().cancelRecurringBilling(sub.hitpayRecurringId)
  }

  await withAdmin(getDb(), { userId: adminId, reason: "admin cancel membership" }, async (tx) => {
    await tx
      .update(schema.memberSubscriptions)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.memberSubscriptions.id, subId),
          eq(schema.memberSubscriptions.status, "active"),
          isNull(schema.memberSubscriptions.cancelledAt),
        ),
      )
  })
  revalidatePath("/memberships")
}
