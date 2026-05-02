"use server"

import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant, type UserRole } from "@bomy/db"
import { HitPayClient, type PaymentRequestResponse } from "@bomy/hitpay"

import { auth } from "@/auth"

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

function addMonths(d: Date, months: number): Date {
  const result = new Date(d)
  result.setMonth(result.getMonth() + months)
  return result
}

// Used by PR #22 subscribe page to show the store's available active plans.
export async function getStorePlans(slug: string) {
  const rows = await withAdmin(
    getDb(),
    {
      userId: "00000000-0000-0000-0000-000000000001",
      reason: "read brand subscription plans for subscribe page",
    },
    async (tx) => {
      const storeRows = await tx
        .select()
        .from(schema.stores)
        .where(eq(schema.stores.slug, slug))
        .limit(1)
      const store = storeRows[0]
      if (!store || store.status !== "active") return null

      const plans = await tx
        .select()
        .from(schema.brandSubscriptionPlans)
        .where(
          and(
            eq(schema.brandSubscriptionPlans.storeId, store.id),
            eq(schema.brandSubscriptionPlans.isActive, true),
          ),
        )
        .orderBy(schema.brandSubscriptionPlans.termMonths)

      return { store, plans }
    },
  )
  return rows
}

// Bound via subscribeToBrand.bind(null, planId) on each plan card.
export async function subscribeToBrand(planId: string, _formData?: FormData) {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/account/subscriptions")

  const appUrl = process.env["NEXTAUTH_URL"] ?? process.env["APP_URL"]
  if (!appUrl)
    throw new Error("NEXTAUTH_URL or APP_URL must be set — required for HitPay checkout redirect")
  // HITPAY_WEBHOOK_URL is optional — falls back to global webhook in HitPay dashboard.
  const webhookUrl = process.env["HITPAY_WEBHOOK_URL"]

  // Read plan + store in one admin pass (plans are public data, but we need
  // store status and slug for the redirect URL).
  const planData = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "read brand subscription plan for subscribe checkout" },
    async (tx) => {
      const rows = await tx
        .select({
          plan: schema.brandSubscriptionPlans,
          store: {
            id: schema.stores.id,
            name: schema.stores.name,
            slug: schema.stores.slug,
            status: schema.stores.status,
          },
        })
        .from(schema.brandSubscriptionPlans)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.brandSubscriptionPlans.storeId))
        .where(
          and(
            eq(schema.brandSubscriptionPlans.id, planId),
            eq(schema.brandSubscriptionPlans.isActive, true),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!planData || planData.store.status !== "active") notFound()

  const { plan, store } = planData

  // Guard: already subscribed (active or payment in-flight) for this store.
  const existing = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({ id: schema.brandSubscriptions.id, status: schema.brandSubscriptions.status })
        .from(schema.brandSubscriptions)
        .where(
          and(
            eq(schema.brandSubscriptions.userId, session.user.id),
            eq(schema.brandSubscriptions.storeId, store.id),
            inArray(schema.brandSubscriptions.status, ["active", "pending"]),
          ),
        )
        .orderBy(desc(schema.brandSubscriptions.createdAt))
        .limit(1),
  )

  if (existing[0]?.status === "active") redirect(`/brands/${store.slug}/subscribe/success`)
  if (existing[0]?.status === "pending") redirect(`/brands/${store.slug}/subscribe/success`)

  const now = new Date()
  const subId = randomUUID()
  const periodEnd = addMonths(now, plan.termMonths)

  // Insert pending row — zero commission/payout; webhook fills these on activation.
  // The CHECK constraint only fires for status='active', so zeros are valid for pending.
  await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "create pending brand_subscription on subscribe" },
    async (tx) => {
      await tx.insert(schema.brandSubscriptions).values({
        id: subId,
        userId: session.user.id,
        storeId: store.id,
        planId: plan.id,
        status: "pending",
        priceMyrSen: plan.priceMyrSen,
        discountPct: plan.discountPct,
        periodStart: now,
        periodEnd,
        bomyCommissionSen: 0n,
        brandPayoutSen: 0n,
      })
    },
  )

  // Call HitPay createPaymentRequest.
  let paymentRequest: PaymentRequestResponse | null = null
  try {
    paymentRequest = await hitpayClient().createPaymentRequest({
      amount: senToMyr(plan.priceMyrSen),
      currency: "MYR",
      email: session.user.email ?? "",
      purpose: `${store.name} Brand Subscription (${plan.termMonths}mo)`,
      redirect_url: `${appUrl}/brands/${store.slug}/subscribe/success`,
      reference_number: subId,
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    })

    // Store payment request ID so webhook can correlate on completion.
    await withAdmin(
      getDb(),
      {
        userId: session.user.id,
        reason: "store hitpay_payment_request_id after createPaymentRequest",
      },
      async (tx) => {
        await tx
          .update(schema.brandSubscriptions)
          .set({ hitpayPaymentRequestId: paymentRequest!.id, updatedAt: new Date() })
          .where(eq(schema.brandSubscriptions.id, subId))
      },
    )
  } catch (err) {
    if (paymentRequest) {
      // HitPay succeeded but DB correlation write failed.
      // Try once more to save the payment request ID. If that also fails,
      // delete the pending row so the user can retry — the payment request
      // URL will expire unused (no auto-charge for payment requests).
      try {
        await withAdmin(
          getDb(),
          {
            userId: session.user.id,
            reason: "preserve hitpay_payment_request_id after DB failure",
          },
          async (tx) => {
            await tx
              .update(schema.brandSubscriptions)
              .set({ hitpayPaymentRequestId: paymentRequest!.id, updatedAt: new Date() })
              .where(eq(schema.brandSubscriptions.id, subId))
          },
        )
      } catch {
        // Fallback write also failed — delete orphan row so user can retry.
        try {
          await withAdmin(
            getDb(),
            {
              userId: session.user.id,
              reason: "delete orphan brand_subscription after double DB failure",
            },
            async (tx) => {
              await tx
                .delete(schema.brandSubscriptions)
                .where(eq(schema.brandSubscriptions.id, subId))
            },
          )
        } catch {
          // Leave row in place for manual reconciliation.
        }
      }
    } else {
      // HitPay was never called — remove orphan row so user can retry.
      try {
        await withAdmin(
          getDb(),
          {
            userId: session.user.id,
            reason: "delete pending brand_subscription after HitPay error",
          },
          async (tx) => {
            await tx
              .delete(schema.brandSubscriptions)
              .where(eq(schema.brandSubscriptions.id, subId))
          },
        )
      } catch {
        // Leave row in place.
      }
    }
    throw err
  }

  redirect(paymentRequest.url)
}

// Returns the active brand discount for a given user+store pair.
// Called by the checkout server action (Stage 5+) to apply the discount to order subtotal.
export async function getActiveBrandDiscount(
  userId: string,
  storeId: string,
  userRole: string,
): Promise<{ discountPct: number } | null> {
  const role = userRole as UserRole
  const rows = await withTenant(getDb(), { userId, userRole: role }, async (tx) =>
    tx
      .select({ discountPct: schema.brandSubscriptions.discountPct })
      .from(schema.brandSubscriptions)
      .where(
        and(
          eq(schema.brandSubscriptions.userId, userId),
          eq(schema.brandSubscriptions.storeId, storeId),
          eq(schema.brandSubscriptions.status, "active"),
        ),
      )
      .orderBy(desc(schema.brandSubscriptions.periodEnd))
      .limit(1),
  )
  return rows[0] ? { discountPct: rows[0].discountPct } : null
}
