"use server"

import { randomUUID } from "node:crypto"
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withPublicRead, withTenant, type UserRole } from "@bomy/db"
import { HitPayClient, type PaymentRequestResponse } from "@bomy/hitpay"

import { auth } from "@/auth"
import { isPendingAbandoned } from "@/lib/membership"
import { paymentsEnabled } from "@/lib/payments-enabled"

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

function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  )
}

// Used by the subscribe page to show the store's available active plans.
export async function getStorePlans(slug: string) {
  return withPublicRead(getDb(), async (tx) => {
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
  })
}

// Bound via subscribeToBrand.bind(null, planId) on each plan card.
export async function subscribeToBrand(planId: string, _formData?: FormData) {
  // PR #39 defence-in-depth guard: page-level CTA gating is primary; this
  // short-circuits direct invocation BEFORE any HitPayClient construction
  // or auth/DB work.
  if (!paymentsEnabled()) notFound()

  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/account/subscriptions")

  const appUrl = process.env["AUTH_URL"] ?? process.env["NEXTAUTH_URL"] ?? process.env["APP_URL"]
  if (!appUrl)
    throw new Error(
      "AUTH_URL, NEXTAUTH_URL or APP_URL must be set — required for HitPay checkout redirect",
    )
  // HITPAY_WEBHOOK_URL is optional — falls back to global webhook in HitPay dashboard.
  const webhookUrl = process.env["HITPAY_WEBHOOK_URL"]

  // Read plan + store via public read (plans are public data, but we need
  // store status and slug for the redirect URL).
  const planData = await withPublicRead(getDb(), async (tx) => {
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
  })

  if (!planData || planData.store.status !== "active") notFound()

  const { plan, store } = planData

  // Guard: already subscribed (active or payment in-flight) for this store.
  const existing = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({
          id: schema.brandSubscriptions.id,
          status: schema.brandSubscriptions.status,
          hitpayPaymentId: schema.brandSubscriptions.hitpayPaymentId,
          createdAt: schema.brandSubscriptions.createdAt,
        })
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

  const successUrl = `/brands/${store.slug}/subscribe/success`
  const current = existing[0]
  if (current?.status === "active") redirect(successUrl)
  if (current?.status === "pending") {
    if (isPendingAbandoned(current, new Date())) {
      // Abandoned checkout (back-button out of HitPay, never paid). Expire it so
      // the partial unique index on (user_id, store_id) WHERE status IN
      // ('active','pending') no longer blocks a fresh checkout, then fall through.
      //
      // Compare-and-swap: a delayed webhook may have activated (and paid) this
      // exact row between the read above and now. Guard the UPDATE on
      // status='pending' AND hitpay_payment_id IS NULL so we never clobber a paid
      // subscription back to expired. (Mirrors joinMembership + the webhook guard.)
      const expired = await withAdmin(
        getDb(),
        {
          userId: session.user.id,
          reason: "expire abandoned pending brand_subscription on re-subscribe",
        },
        async (tx) =>
          tx
            .update(schema.brandSubscriptions)
            .set({ status: "expired", updatedAt: new Date() })
            .where(
              and(
                eq(schema.brandSubscriptions.id, current.id),
                eq(schema.brandSubscriptions.userId, session.user.id),
                eq(schema.brandSubscriptions.storeId, store.id),
                eq(schema.brandSubscriptions.status, "pending"),
                isNull(schema.brandSubscriptions.hitpayPaymentId),
              ),
            )
            .returning({ id: schema.brandSubscriptions.id }),
      )

      if (expired.length === 0) {
        // The row changed under us (a webhook paid it, or it was reaped). Re-read
        // and route rather than creating a duplicate checkout on a paid sub.
        const recheck = await withTenant(
          getDb(),
          { userId: session.user.id, userRole: session.user.role },
          async (tx) =>
            tx
              .select({ status: schema.brandSubscriptions.status })
              .from(schema.brandSubscriptions)
              .where(
                and(
                  eq(schema.brandSubscriptions.userId, session.user.id),
                  eq(schema.brandSubscriptions.storeId, store.id),
                  inArray(schema.brandSubscriptions.status, ["active", "pending"]),
                ),
              )
              .limit(1),
        )
        if (recheck[0]?.status === "active") redirect(successUrl)
        if (recheck[0]?.status === "pending") redirect(successUrl)
        // else: nothing active/pending — fall through to create one.
      }
    } else {
      // Genuinely in-flight (just paid, awaiting webhook) — show the success poller.
      redirect(successUrl)
    }
  }

  const now = new Date()
  const subId = randomUUID()
  const periodEnd = addMonths(now, plan.termMonths)

  // Insert pending row — zero commission/payout; webhook fills these on activation.
  // The CHECK constraint only fires for status='active', so zeros are valid for pending.
  // The partial unique index on (user_id, store_id) WHERE status IN ('active','pending')
  // is the DB-level guard against concurrent double-submit; 23505 → redirect to success.
  try {
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
  } catch (err) {
    if (isUniqueViolation(err)) redirect(`/brands/${store.slug}/subscribe/success`)
    throw err
  }

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
      allow_repeated_payments: false,
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
          .where(
            and(
              eq(schema.brandSubscriptions.id, subId),
              eq(schema.brandSubscriptions.userId, session.user.id),
            ),
          )
      },
    )
  } catch (err) {
    if (paymentRequest) {
      // HitPay succeeded but DB correlation write failed.
      // Try once more to save the payment request ID so the webhook can correlate.
      // If the fallback succeeds, redirect to checkout — the user can complete payment
      // and the row is properly linked. Only delete the row if both writes fail.
      let fallbackSaved = false
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
              .where(
                and(
                  eq(schema.brandSubscriptions.id, subId),
                  eq(schema.brandSubscriptions.userId, session.user.id),
                ),
              )
          },
        )
        fallbackSaved = true
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
                .where(
                  and(
                    eq(schema.brandSubscriptions.id, subId),
                    eq(schema.brandSubscriptions.userId, session.user.id),
                  ),
                )
            },
          )
        } catch {
          // Leave row in place for manual reconciliation.
        }
      }
      if (fallbackSaved) {
        // Row has the payment request ID — redirect to checkout.
        // The user can complete payment; the webhook will activate the subscription.
        redirect(paymentRequest.url)
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
              .where(
                and(
                  eq(schema.brandSubscriptions.id, subId),
                  eq(schema.brandSubscriptions.userId, session.user.id),
                ),
              )
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

/**
 * Escape hatch for the success page: the user gave up waiting / never paid for a
 * brand subscription. Mark any abandoned pending row for this store expired so
 * the partial unique index no longer blocks a fresh checkout and they can start
 * over. Guarded on hitpay_payment_id IS NULL so a row a webhook has already paid
 * is never clobbered back to expired — that delayed webhook (or a re-read on the
 * subscribe page) still routes the user to the active subscription.
 */
export async function abandonPendingBrandSubscription(slug: string) {
  const session = await auth()
  if (!session) redirect(`/auth/sign-in?callbackUrl=/brands/${slug}/subscribe`)

  const store = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "resolve store to abandon pending brand subscription" },
    async (tx) => {
      const rows = await tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(eq(schema.stores.slug, slug))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!store) notFound()

  await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "user abandoned pending brand subscription checkout" },
    async (tx) => {
      await tx
        .update(schema.brandSubscriptions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(schema.brandSubscriptions.userId, session.user.id),
            eq(schema.brandSubscriptions.storeId, store.id),
            eq(schema.brandSubscriptions.status, "pending"),
            isNull(schema.brandSubscriptions.hitpayPaymentId),
          ),
        )
    },
  )

  redirect(`/brands/${slug}/subscribe`)
}

// Returns the active brand discount for a given user+store pair.
// Called by the checkout server action (Stage 5+) to apply the discount to order subtotal.
// Filters period_end > now() so expired subscriptions (not yet swept by the expiry job)
// never grant stale discounts.
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
          gt(schema.brandSubscriptions.periodEnd, new Date()),
        ),
      )
      .orderBy(desc(schema.brandSubscriptions.periodEnd))
      .limit(1),
  )
  return rows[0] ? { discountPct: rows[0].discountPct } : null
}
