import { Fragment } from "react"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { Card, CardContent } from "@/components/ui/card"
import { CreatePlanForm } from "./create-plan-form"
import { EditPlanForm } from "./edit-plan-form"
import { getSellerPlansData } from "./actions"

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
        <p className="text-muted-foreground">No store found. Contact BOMY support.</p>
      </div>
    )
  }

  const { plans, countByPlan, paidPayouts, pendingPayouts } = data

  const usedTerms = new Set(plans.map((p) => p.termMonths))
  const availableTerms = ([3, 6, 12] as const).filter((t) => !usedTerms.has(t))

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold text-foreground">Brand Subscription Plans</h1>

      {/* ── Plans table ───────────────────────────────────────────── */}
      {plans.length === 0 ? (
        <p className="mb-8 text-sm text-muted-foreground">
          No plans yet. Create your first plan below.
        </p>
      ) : (
        <div className="mb-8 overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted text-xs font-medium uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left">Term</th>
                <th className="px-5 py-3 text-left">Price (RM)</th>
                <th className="px-5 py-3 text-left">Discount</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Subscribers</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map((plan) => {
                const isEditing = editingPlanId === plan.id
                return (
                  <Fragment key={plan.id}>
                    <tr className="hover:bg-muted">
                      <td className="px-5 py-3 font-medium text-foreground">
                        {TERM_LABELS[plan.termMonths] ?? `${plan.termMonths}mo`}
                      </td>
                      <td className="px-5 py-3 text-foreground">RM {senToMyr(plan.priceMyrSen)}</td>
                      <td className="px-5 py-3 text-foreground">{plan.discountPct}%</td>
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
                      <td className="px-5 py-3 text-right text-foreground">
                        {countByPlan[plan.id] ?? 0}
                      </td>
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <a
                            href="/seller/dashboard/subscriptions"
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            Cancel
                          </a>
                        ) : (
                          <a
                            href={`/seller/dashboard/subscriptions?edit=${plan.id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            Edit
                          </a>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="bg-accent">
                        <td colSpan={6} className="px-5 py-4">
                          <EditPlanForm
                            planId={plan.id}
                            defaultPriceMyr={senToMyr(plan.priceMyrSen)}
                            defaultDiscountPct={plan.discountPct}
                            defaultDescription={plan.description ?? ""}
                          />
                          {plan.isActive ? (
                            <p className="mt-2 text-xs text-amber-700">
                              Saving will deactivate this plan — BOMY must re-approve the updated
                              price/discount before buyers can subscribe again.
                            </p>
                          ) : (
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
        <div className="mb-8 rounded-xl border border-border bg-background shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Payout History</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted text-xs font-medium uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left">Plan</th>
                <th className="px-5 py-3 text-left">Subscription ends</th>
                <th className="px-5 py-3 text-right">Payout (RM)</th>
                <th className="px-5 py-3 text-left">Paid on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendingPayouts.map((row) => {
                const plan = plans.find((p) => p.id === row.planId)
                return (
                  <tr key={row.id} className="bg-amber-50">
                    <td className="px-5 py-3 text-foreground">
                      {TERM_LABELS[plan?.termMonths ?? 0] ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {row.periodEnd.toLocaleDateString("en-MY")}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">
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
                  <tr key={row.id} className="hover:bg-muted">
                    <td className="px-5 py-3 text-foreground">
                      {TERM_LABELS[plan?.termMonths ?? 0] ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {row.periodEnd.toLocaleDateString("en-MY")}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">
                      RM {senToMyr(row.brandPayoutSen)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
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
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              All three term lengths (3, 6, 12 months) are configured. Edit an existing plan above
              to adjust pricing or description.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-medium text-foreground">Create New Plan</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              New plans are inactive until BOMY activates them. Contact support after creating.
            </p>
            <CreatePlanForm availableTerms={[...availableTerms]} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
