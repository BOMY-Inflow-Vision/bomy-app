import { desc, eq } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { AccountTabs } from "../account-tabs"

const { db } = makeDb()

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
}

function senToMyr(sen: bigint): string {
  return `RM${Number(sen) / 100}`
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
  payment_failed: "Payment failed",
}

const STATUS_CLASS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  expired: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-100 text-red-600",
  payment_failed: "bg-red-100 text-red-600",
}

export default async function AccountSubscriptionsPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/account/subscriptions")

  // Fetch all brand subscriptions for this user, joined with store info.
  const subs = await withTenant(
    db,
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({
          id: schema.brandSubscriptions.id,
          status: schema.brandSubscriptions.status,
          priceMyrSen: schema.brandSubscriptions.priceMyrSen,
          discountPct: schema.brandSubscriptions.discountPct,
          periodEnd: schema.brandSubscriptions.periodEnd,
          periodStart: schema.brandSubscriptions.periodStart,
          storeName: schema.stores.name,
          storeSlug: schema.stores.slug,
          termMonths: schema.brandSubscriptionPlans.termMonths,
        })
        .from(schema.brandSubscriptions)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.brandSubscriptions.storeId))
        .innerJoin(
          schema.brandSubscriptionPlans,
          eq(schema.brandSubscriptionPlans.id, schema.brandSubscriptions.planId),
        )
        .where(eq(schema.brandSubscriptions.userId, session.user.id))
        .orderBy(desc(schema.brandSubscriptions.createdAt)),
  )

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-16">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <AccountTabs active="subscriptions" />

        <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand subscriptions</h2>

        {subs.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500 mb-4">No brand subscriptions yet.</p>
            <p className="text-xs text-gray-400">
              Visit a brand{"'"}s store page to subscribe and unlock exclusive discounts.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {subs.map((sub) => {
              const termLabel =
                sub.termMonths === 12 ? "12-month" : sub.termMonths === 6 ? "6-month" : "3-month"
              const statusLabel = STATUS_LABEL[sub.status] ?? sub.status
              const statusClass = STATUS_CLASS[sub.status] ?? "bg-gray-100 text-gray-500"

              return (
                <li key={sub.id} className="flex items-start justify-between py-4 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {sub.storeName}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {termLabel} · {senToMyr(sub.priceMyrSen)} · {sub.discountPct}% off orders
                    </p>
                    {(sub.status === "active" || sub.status === "pending") && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Ends {formatDate(sub.periodEnd)}
                      </p>
                    )}
                    {sub.status === "expired" || sub.status === "cancelled" ? (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Ended {formatDate(sub.periodEnd)}
                      </p>
                    ) : null}
                  </div>
                  {sub.status === "expired" || sub.status === "cancelled" ? (
                    <Link
                      href={`/brands/${sub.storeSlug}/subscribe`}
                      className="shrink-0 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      Renew
                    </Link>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
