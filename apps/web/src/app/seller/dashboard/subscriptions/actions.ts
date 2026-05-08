"use server"

import { and, count, desc, eq, gt, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

function parseMyrToSen(myr: string): bigint {
  const trimmed = myr.trim()
  const m = trimmed.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!m) throw new Error(`Invalid amount: "${trimmed}"`)
  const sen = BigInt(m[1]!) * 100n + BigInt((m[2] ?? "0").padEnd(2, "0"))
  if (sen === 0n) throw new Error("Price must be greater than zero")
  return sen
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  )
}

async function requireSeller() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")
  return session
}

export async function getSellerPlansData() {
  const session = await requireSeller()

  return withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const storeRows = await tx
        .select()
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, session.user.id))
        .limit(1)
      const store = storeRows[0] ?? null
      if (!store) return null

      const plans = await tx
        .select()
        .from(schema.brandSubscriptionPlans)
        .where(eq(schema.brandSubscriptionPlans.storeId, store.id))
        .orderBy(schema.brandSubscriptionPlans.termMonths)

      // Only count subscriptions that are both active in status and within their period.
      // Expired-but-not-yet-swept rows (periodEnd in the past) are excluded.
      const subCounts = await tx
        .select({
          planId: schema.brandSubscriptions.planId,
          activeCount: count(),
        })
        .from(schema.brandSubscriptions)
        .where(
          and(
            eq(schema.brandSubscriptions.storeId, store.id),
            eq(schema.brandSubscriptions.status, "active"),
            gt(schema.brandSubscriptions.periodEnd, new Date()),
          ),
        )
        .groupBy(schema.brandSubscriptions.planId)

      const countByPlan: Record<string, number> = {}
      for (const r of subCounts) countByPlan[r.planId] = r.activeCount

      // Payout history: include active AND expired rows so that payouts are not
      // lost from the history just because a subscription has since expired.
      // Pending = no brand_payout_at. Paid = brand_payout_at set by admin.
      const payouts = await tx
        .select({
          id: schema.brandSubscriptions.id,
          planId: schema.brandSubscriptions.planId,
          priceMyrSen: schema.brandSubscriptions.priceMyrSen,
          brandPayoutSen: schema.brandSubscriptions.brandPayoutSen,
          brandPayoutAt: schema.brandSubscriptions.brandPayoutAt,
          periodEnd: schema.brandSubscriptions.periodEnd,
          status: schema.brandSubscriptions.status,
        })
        .from(schema.brandSubscriptions)
        .where(
          and(
            eq(schema.brandSubscriptions.storeId, store.id),
            inArray(schema.brandSubscriptions.status, ["active", "expired"]),
          ),
        )
        .orderBy(desc(schema.brandSubscriptions.periodEnd))
        .limit(50)

      const paidPayouts = payouts.filter((r) => r.brandPayoutAt !== null)
      const pendingPayouts = payouts.filter((r) => r.brandPayoutAt === null)

      return { store, plans, countByPlan, paidPayouts, pendingPayouts }
    },
  )
}

export async function createPlan(formData: FormData) {
  const session = await requireSeller()

  const termMonths = Number(str(formData, "termMonths"))
  if (![3, 6, 12].includes(termMonths)) throw new Error("Term must be 3, 6, or 12 months")

  const priceMyrSen = parseMyrToSen(str(formData, "priceMyrSen"))

  const discountPct = Number(str(formData, "discountPct"))
  if (!Number.isInteger(discountPct) || discountPct < 5 || discountPct > 10)
    throw new Error("Discount must be between 5% and 10%")

  const description = str(formData, "description").trim() || null

  try {
    await withTenant(
      getDb(),
      { userId: session.user.id, userRole: session.user.role },
      async (tx) => {
        const storeRows = await tx
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(eq(schema.stores.ownerId, session.user.id))
          .limit(1)

        if (!storeRows[0]) throw new Error("No store found for this seller")

        await tx.insert(schema.brandSubscriptionPlans).values({
          storeId: storeRows[0].id,
          termMonths,
          priceMyrSen,
          discountPct,
          description,
        })
      },
    )
  } catch (err) {
    if (isUniqueViolation(err))
      throw new Error("A plan for this term length already exists for your store")
    throw err
  }

  revalidatePath("/seller/dashboard/subscriptions")
}

export async function updatePlan(planId: string, formData: FormData) {
  const session = await requireSeller()

  const priceMyrSen = parseMyrToSen(str(formData, "priceMyrSen"))

  const discountPct = Number(str(formData, "discountPct"))
  if (!Number.isInteger(discountPct) || discountPct < 5 || discountPct > 10)
    throw new Error("Discount must be between 5% and 10%")

  const description = str(formData, "description").trim() || null

  // Editing any field resets isActive to false so BOMY must re-approve the
  // updated price/discount before buyers can subscribe. Existing active
  // subscriptions are unaffected (values are snapshotted at purchase).
  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .update(schema.brandSubscriptionPlans)
        .set({ priceMyrSen, discountPct, description, isActive: false, updatedAt: new Date() })
        .where(eq(schema.brandSubscriptionPlans.id, planId))
        .returning({ id: schema.brandSubscriptionPlans.id }),
  )

  if (updated.length === 0) throw new Error("Plan not found or not authorized")

  revalidatePath("/seller/dashboard/subscriptions")
}
