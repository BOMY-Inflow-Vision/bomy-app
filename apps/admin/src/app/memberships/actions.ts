"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { HitPayClient } from "@bomy/hitpay"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

export async function updateRenewalNotificationDays(formData: FormData) {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  const raw = (formData.get("notificationDays") as string | null)?.trim()
  if (!raw) throw new Error("Notification days are required")

  const days = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)

  if (days.length === 0) throw new Error("At least one positive integer day is required")

  await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin update renewal_notification_days" },
    async (tx) => {
      await tx
        .insert(schema.platformConfig)
        .values({
          key: "renewal_notification_days",
          value: days,
          description: "Days before membership expiry at which renewal reminder emails are sent.",
          updatedBy: session.user.id,
        })
        .onConflictDoUpdate({
          target: schema.platformConfig.key,
          set: { value: days, updatedBy: session.user.id, updatedAt: new Date() },
        })
    },
  )
  revalidatePath("/memberships")
}

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
      .set({ cancelledAt: new Date(), updatedAt: new Date() })
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
