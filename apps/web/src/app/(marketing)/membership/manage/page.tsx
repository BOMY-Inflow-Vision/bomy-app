import { and, eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { SubmitButton } from "@/components/submit-button"
import { cancelMembership } from "../actions"

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })
}

export default async function MembershipManagePage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership/manage")

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
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!sub) redirect("/membership")

  const priceMyr = `RM${Number(sub.priceMyrSen) / 100}`
  const isCancelling = sub.cancelledAt !== null

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 pt-20">
      <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200">
        <div className="mb-6 flex items-center gap-3">
          {isCancelling ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Cancellation scheduled
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              Active
            </span>
          )}
          <h1 className="text-xl font-semibold text-gray-900">BOMY Platform Membership</h1>
        </div>

        <dl className="mb-8 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Plan</dt>
            <dd className="font-medium text-gray-900">Annual</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Price</dt>
            <dd className="font-medium text-gray-900">{priceMyr}/yr</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Current period</dt>
            <dd className="font-medium text-gray-900">
              {formatDate(sub.periodStart)} – {formatDate(sub.periodEnd)}
            </dd>
          </div>
          {isCancelling ? (
            <div className="flex justify-between">
              <dt className="text-gray-500">Active until</dt>
              <dd className="font-medium text-gray-900">{formatDate(sub.periodEnd)}</dd>
            </div>
          ) : (
            <div className="flex justify-between">
              <dt className="text-gray-500">Renews on</dt>
              <dd className="font-medium text-gray-900">{formatDate(sub.periodEnd)}</dd>
            </div>
          )}
        </dl>

        <div className="border-t border-gray-100 pt-6">
          {isCancelling ? (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Your membership will remain active until <strong>{formatDate(sub.periodEnd)}</strong>.
              Automatic renewal has been cancelled.
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-500">
                Cancelling will stop automatic renewal. Your membership stays active until{" "}
                <strong>{formatDate(sub.periodEnd)}</strong>.
              </p>
              <form action={cancelMembership}>
                <SubmitButton className="w-full rounded-xl border border-red-200 bg-white px-6 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors">
                  Cancel membership
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
