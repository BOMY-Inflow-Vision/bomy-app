import { Fragment } from "react"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { createPlan, getSellerPlansData, updatePlan } from "./actions"

function senToMyr(sen: bigint): string {
  const whole = sen / 100n
  const frac = String(sen % 100n).padStart(2, "0")
  return `${whole}.${frac}`
}

const TERM_LABELS: Record<number, string> = {
  3: "3 months",
  6: "6 months",
  12: "12 months",
}

export default async function SellerSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const { edit: editingPlanId } = await searchParams

  const data = await getSellerPlansData()

  if (!data) {
    return (
      <div className="flex min-h-64 items-center justify-center p-8">
        <p className="text-gray-500">No store found. Contact BOMY support.</p>
      </div>
    )
  }

  const { plans, countByPlan, paidPayouts, pendingPayouts } = data

  const usedTerms = new Set(plans.map((p) => p.termMonths))
  const availableTerms = ([3, 6, 12] as const).filter((t) => !usedTerms.has(t))

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Brand Subscription Plans</h1>

      {/* ── Plans table ───────────────────────────────────────────── */}
      {plans.length === 0 ? (
        <p className="mb-8 text-sm text-gray-500">No plans yet. Create your first plan below.</p>
      ) : (
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left">Term</th>
                <th className="px-5 py-3 text-left">Price (RM)</th>
                <th className="px-5 py-3 text-left">Discount</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Subscribers</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map((plan) => {
                const isEditing = editingPlanId === plan.id
                return (
                  <Fragment key={plan.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {TERM_LABELS[plan.termMonths] ?? `${plan.termMonths}mo`}
                      </td>
                      <td className="px-5 py-3 text-gray-700">RM {senToMyr(plan.priceMyrSen)}</td>
                      <td className="px-5 py-3 text-gray-700">{plan.discountPct}%</td>
                      <td className="px-5 py-3">
                        {plan.isActive ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            Pending activation
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-700">
                        {countByPlan[plan.id] ?? 0}
                      </td>
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <a
                            href="/seller/dashboard/subscriptions"
                            className="text-xs text-gray-500 hover:underline"
                          >
                            Cancel
                          </a>
                        ) : (
                          <a
                            href={`/seller/dashboard/subscriptions?edit=${plan.id}`}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Edit
                          </a>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="bg-indigo-50">
                        <td colSpan={6} className="px-5 py-4">
                          <form
                            action={updatePlan.bind(null, plan.id)}
                            className="flex flex-wrap items-end gap-3"
                          >
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Price (RM)
                              </label>
                              <input
                                name="priceMyrSen"
                                defaultValue={senToMyr(plan.priceMyrSen)}
                                required
                                className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Discount (%)
                              </label>
                              <select
                                name="discountPct"
                                defaultValue={plan.discountPct}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                              >
                                {[5, 6, 7, 8, 9, 10].map((n) => (
                                  <option key={n} value={n}>
                                    {n}%
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Description (optional)
                              </label>
                              <input
                                name="description"
                                defaultValue={plan.description ?? ""}
                                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <button
                              type="submit"
                              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                            >
                              Save
                            </button>
                          </form>
                          {!plan.isActive && (
                            <p className="mt-2 text-xs text-amber-600">
                              This plan is pending activation. Contact BOMY support to make it live
                              for buyers.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Payout history ────────────────────────────────────────── */}
      {(paidPayouts.length > 0 || pendingPayouts.length > 0) && (
        <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Payout History</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left">Plan</th>
                <th className="px-5 py-3 text-left">Subscription ends</th>
                <th className="px-5 py-3 text-right">Payout (RM)</th>
                <th className="px-5 py-3 text-left">Paid on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingPayouts.map((row) => {
                const plan = plans.find((p) => p.id === row.planId)
                return (
                  <tr key={row.id} className="bg-amber-50">
                    <td className="px-5 py-3 text-gray-700">
                      {TERM_LABELS[plan?.termMonths ?? 0] ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {row.periodEnd.toLocaleDateString("en-MY")}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">
                      RM {senToMyr(row.brandPayoutSen)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        Pending
                      </span>
                    </td>
                  </tr>
                )
              })}
              {paidPayouts.map((row) => {
                const plan = plans.find((p) => p.id === row.planId)
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-700">
                      {TERM_LABELS[plan?.termMonths ?? 0] ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {row.periodEnd.toLocaleDateString("en-MY")}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">
                      RM {senToMyr(row.brandPayoutSen)}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {row.brandPayoutAt!.toLocaleDateString("en-MY")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create plan form ──────────────────────────────────────── */}
      {availableTerms.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">
            All three term lengths (3, 6, 12 months) are configured. Edit an existing plan above to
            adjust pricing or description.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-medium text-gray-900">Create New Plan</h2>
          <p className="mb-4 text-xs text-gray-500">
            New plans are inactive until BOMY activates them. Contact support after creating.
          </p>
          <form action={createPlan} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Term length</label>
              <select
                name="termMonths"
                required
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select term</option>
                {availableTerms.map((t) => (
                  <option key={t} value={t}>
                    {TERM_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Price (RM)</label>
              <input
                name="priceMyrSen"
                placeholder="e.g. 50.00"
                required
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Buyer discount (%)
              </label>
              <select
                name="discountPct"
                required
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select %</option>
                {[5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Description (optional)
              </label>
              <input
                name="description"
                placeholder="Describe subscriber benefits"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Create Plan
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
