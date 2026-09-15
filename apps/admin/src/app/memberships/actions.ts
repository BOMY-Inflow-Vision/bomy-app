"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { HitPayClient } from "@bomy/hitpay"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"
import { flashToast } from "@/lib/flash-toast-server"

// Server-form trigger (no client JS runs after submit) — must not throw for an expected
// failure; flashes a toast for both outcomes itself instead of returning a result.
export async function updateRenewalNotificationDays(formData: FormData): Promise<void> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }

  const raw = (formData.get("notificationDays") as string | null)?.trim()
  if (!raw) {
    await flashToast("error", "Notification days are required.")
    return
  }

  const days = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)

  if (days.length === 0) {
    await flashToast("error", "At least one positive integer day is required.")
    return
  }

  try {
    await withAdmin(
      getDb(),
      { userId: authz.adminId, reason: "admin update renewal_notification_days" },
      async (tx) => {
        await tx
          .insert(schema.platformConfig)
          .values({
            key: "renewal_notification_days",
            value: days,
            description: "Days before membership expiry at which renewal reminder emails are sent.",
            updatedBy: authz.adminId,
          })
          .onConflictDoUpdate({
            target: schema.platformConfig.key,
            set: { value: days, updatedBy: authz.adminId, updatedAt: new Date() },
          })
      },
    )
  } catch {
    await flashToast("error", "Could not update renewal notification days.")
    return
  }

  revalidatePath("/memberships")
  await flashToast("success", "Renewal notification days updated.")
}

function hitpayClient() {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  if (!apiKey) throw new Error("HITPAY_API_KEY is required")
  if (!apiUrl) throw new Error("HITPAY_API_URL is required")
  return new HitPayClient({ apiKey, baseUrl: apiUrl })
}

// Server-form trigger — flashes every outcome instead of throwing.
export async function cancelMembership(subId: string): Promise<void> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }
  const adminId = authz.adminId

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
          periodEnd: schema.memberSubscriptions.periodEnd,
        })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.id, subId))
        .limit(1),
  )

  if (!sub) {
    await flashToast("error", "Subscription not found.")
    return
  }
  if (sub.status === "active" && sub.cancelledAt !== null) {
    await flashToast("error", "This membership is already scheduled to cancel.")
    return
  }
  if (sub.status !== "active") {
    await flashToast("error", `Cannot cancel: subscription is '${sub.status}'.`)
    return
  }

  if (sub.hitpayRecurringId) {
    try {
      await hitpayClient().cancelRecurringBilling(sub.hitpayRecurringId)
    } catch (err) {
      // Renewal is still live at HitPay, so don't record the cancellation; the admin can retry.
      console.error("[admin cancelMembership] HitPay cancel failed", err)
      await flashToast(
        "error",
        "HitPay couldn't cancel the renewal, so nothing was changed. Please try again.",
      )
      return
    }
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

  const activeUntil = sub.periodEnd.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  await flashToast(
    "success",
    `Membership cancelled — renewal stopped; it stays active until ${activeUntil}.`,
  )
}
