"use server"

import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray } from "drizzle-orm"
import { redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"
import { HitPayClient } from "@bomy/hitpay"

import { auth } from "@/auth"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

const { db } = makeDb()

function hitpayClient() {
  const apiKey = process.env["HITPAY_API_KEY"]
  const baseUrl = process.env["HITPAY_BASE_URL"]
  if (!apiKey) throw new Error("HITPAY_API_KEY is required")
  if (!baseUrl) throw new Error("HITPAY_BASE_URL is required")
  return new HitPayClient({ apiKey, saltKey: "", baseUrl })
}

function senToMyr(sen: bigint): string {
  const whole = sen / 100n
  const frac = String(sen % 100n).padStart(2, "0")
  return `${whole}.${frac}`
}

function addOneYear(d: Date): Date {
  const result = new Date(d)
  result.setFullYear(result.getFullYear() + 1)
  return result
}

export async function joinMembership() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership")

  const appUrl = process.env["NEXTAUTH_URL"] ?? process.env["APP_URL"] ?? "http://localhost:3000"

  // Read platform price — platform_config is staff-only, use bypass
  const priceSen = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read platform membership price for join action" },
    async (tx) => {
      const rows = await tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "platform_membership_price_myr_sen"))
        .limit(1)
      if (!rows[0]) throw new Error("platform_membership_price_myr_sen not in platform_config")
      return BigInt(rows[0].value as number)
    },
  )

  // Guard: already active or payment in-flight
  const existing = await withTenant(
    db,
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({ id: schema.memberSubscriptions.id, status: schema.memberSubscriptions.status })
        .from(schema.memberSubscriptions)
        .where(
          and(
            eq(schema.memberSubscriptions.userId, session.user.id),
            inArray(schema.memberSubscriptions.status, ["active", "pending"]),
          ),
        )
        .limit(1),
  )

  if (existing[0]?.status === "active") redirect("/membership/manage")
  if (existing[0]?.status === "pending") redirect("/membership/success")

  const now = new Date()
  const subId = randomUUID()

  // Insert pending row first — webhook lookup depends on hitpayRecurringId being set
  await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "create pending member_subscription on join" },
    async (tx) => {
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId: session.user.id,
        status: "pending",
        priceMyrSen: priceSen,
        periodStart: now,
        periodEnd: addOneYear(now),
      })
    },
  )

  let checkoutUrl: string
  try {
    const billing = await hitpayClient().createRecurringBilling({
      plan: {
        amount: senToMyr(priceSen),
        currency: "MYR",
        name: "BOMY Platform Membership",
        cycle: "yearly",
      },
      customer: { email: session.user.email ?? "" },
      reference: subId,
      redirect_url: `${appUrl}/membership/success`,
    })

    await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: "store hitpay_recurring_id after createRecurringBilling" },
      async (tx) => {
        await tx
          .update(schema.memberSubscriptions)
          .set({ hitpayRecurringId: billing.id, updatedAt: new Date() })
          .where(eq(schema.memberSubscriptions.id, subId))
      },
    )

    checkoutUrl = billing.url
  } catch (err) {
    // Clean up pending row so the user can retry
    await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: "delete pending member_subscription after HitPay error" },
      async (tx) => {
        await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
      },
    )
    throw err
  }

  redirect(checkoutUrl)
}

export async function cancelMembership() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership")

  const sub = await withTenant(
    db,
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select()
        .from(schema.memberSubscriptions)
        .where(
          and(
            eq(schema.memberSubscriptions.userId, session.user.id),
            eq(schema.memberSubscriptions.status, "active"),
          ),
        )
        .orderBy(desc(schema.memberSubscriptions.createdAt))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!sub) redirect("/membership")

  if (sub.hitpayRecurringId) {
    await hitpayClient().cancelRecurringBilling(sub.hitpayRecurringId)
  }

  // Optimistic cancel — webhook's cancelled event is idempotent
  await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "user-initiated membership cancellation" },
    async (tx) => {
      await tx
        .update(schema.memberSubscriptions)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.memberSubscriptions.id, sub.id))
    },
  )

  redirect("/membership")
}
