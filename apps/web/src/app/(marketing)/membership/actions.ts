"use server"

import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"
import { HitPayClient, type RecurringBillingResponse } from "@bomy/hitpay"

import { auth } from "@/auth"
import { paymentsEnabled } from "@/lib/payments-enabled"

// Lazy DB singleton — module is importable without DATABASE_URL at startup
let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

function hitpayClient() {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  if (!apiKey) throw new Error("HITPAY_API_KEY is required")
  if (!apiUrl) throw new Error("HITPAY_API_URL is required")
  return new HitPayClient({ apiKey, baseUrl: apiUrl })
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

function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  )
}

export async function joinMembership() {
  // PR #39 defence-in-depth guard: page-level CTA gating is primary; this
  // short-circuits direct invocation (stale page cache, manual curl, race)
  // BEFORE any HitPayClient construction or auth/DB work.
  if (!paymentsEnabled()) notFound()

  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership")

  const appUrl = process.env["NEXTAUTH_URL"] ?? process.env["APP_URL"]
  if (!appUrl)
    throw new Error("NEXTAUTH_URL or APP_URL must be set — required for HitPay checkout redirect")
  // HITPAY_WEBHOOK_URL is optional. If unset, HitPay uses the global webhook URL
  // configured in the dashboard (typically the apps/api /webhooks/hitpay endpoint).
  // Set this env var to route webhooks to a specific environment or URL.
  const webhookUrl = process.env["HITPAY_WEBHOOK_URL"]

  // Read platform price — platform_config is staff-only; use real user as audit actor
  const priceSen = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "read platform membership price for join" },
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
    getDb(),
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

  // Insert pending row — unique index on (user_id) WHERE status='pending' guards
  // against concurrent double-submit at the DB level
  try {
    await withAdmin(
      getDb(),
      { userId: session.user.id, reason: "create pending member_subscription on join" },
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
  } catch (err) {
    if (isUniqueViolation(err)) redirect("/membership/success")
    throw err
  }

  // Call HitPay — track billing so we can cancel it if DB correlation fails
  let billing: RecurringBillingResponse | null = null
  try {
    billing = await hitpayClient().createRecurringBilling({
      plan: {
        amount: senToMyr(priceSen),
        currency: "MYR",
        name: "BOMY Platform Membership",
        cycle: "yearly",
      },
      customer: { email: session.user.email ?? "" },
      reference: subId,
      redirect_url: `${appUrl}/membership/success`,
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    })

    // Store recurring ID — if this fails, cancel the live HitPay billing
    await withAdmin(
      getDb(),
      { userId: session.user.id, reason: "store hitpay_recurring_id after createRecurringBilling" },
      async (tx) => {
        await tx
          .update(schema.memberSubscriptions)
          .set({ hitpayRecurringId: billing!.id, updatedAt: new Date() })
          .where(eq(schema.memberSubscriptions.id, subId))
      },
    )
  } catch (err) {
    if (billing) {
      // HitPay succeeded but DB correlation write failed.
      // Try to cancel the live billing to avoid an unlinked subscription.
      let cancelSucceeded = false
      try {
        await hitpayClient().cancelRecurringBilling(billing.id)
        cancelSucceeded = true
      } catch {
        // Cancel also failed — try to write hitpayRecurringId onto the pending
        // row so the webhook can still correlate if HitPay fires later.
        try {
          await withAdmin(
            getDb(),
            {
              userId: session.user.id,
              reason: "preserve hitpay_recurring_id after cancel failure",
            },
            async (tx) => {
              await tx
                .update(schema.memberSubscriptions)
                .set({ hitpayRecurringId: billing!.id, updatedAt: new Date() })
                .where(eq(schema.memberSubscriptions.id, subId))
            },
          )
        } catch {
          // Both cancel and correlation write failed.
          // Row subId (reference passed to HitPay) remains for manual reconciliation.
        }
      }
      if (cancelSucceeded) {
        // Live billing cancelled — safe to remove the orphan pending row.
        await withAdmin(
          getDb(),
          { userId: session.user.id, reason: "delete pending member_subscription after error" },
          async (tx) => {
            await tx
              .delete(schema.memberSubscriptions)
              .where(eq(schema.memberSubscriptions.id, subId))
          },
        )
      }
      // If cancel failed, leave the row in place for reconciliation.
    } else {
      // HitPay was never called — no live billing to cancel.
      // Remove the orphan pending row so the user can retry.
      await withAdmin(
        getDb(),
        {
          userId: session.user.id,
          reason: "delete pending member_subscription after HitPay error",
        },
        async (tx) => {
          await tx
            .delete(schema.memberSubscriptions)
            .where(eq(schema.memberSubscriptions.id, subId))
        },
      )
    }
    throw err
  }

  redirect(billing.url)
}

export async function cancelMembership() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership")

  const sub = await withTenant(
    getDb(),
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

  // Record cancellation intent only — status stays 'active' until period_end.
  // apps/api MembershipCancellationExpiryJob sweeps daily and sets
  // status='cancelled' once period_end passes.
  await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "user-initiated membership cancellation" },
    async (tx) => {
      await tx
        .update(schema.memberSubscriptions)
        .set({ cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.memberSubscriptions.id, sub.id))
    },
  )

  redirect("/membership/manage")
}
