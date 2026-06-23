import { asc, eq, inArray } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"

import { fetchNegativeCommissionOrders } from "../../orders/_queries"
import { RefundButton } from "./_refund-button"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

export default async function ReconciliationPage() {
  const session = await auth()
  const canRefund = ["bomy_admin", "bomy_finance"].includes(
    (session?.user as { role?: string } | undefined)?.role ?? "",
  )

  const [negativeOrders, reviewSessions, duplicateCharges] = await Promise.all([
    fetchNegativeCommissionOrders(getDb()),
    withAdmin(
      getDb(),
      { userId: SYSTEM_ACTOR, reason: "admin list payment review sessions" },
      async (tx) =>
        tx
          .select({
            id: schema.checkoutSessions.id,
            status: schema.checkoutSessions.status,
            paymentReviewReason: schema.checkoutSessions.paymentReviewReason,
            createdAt: schema.checkoutSessions.createdAt,
          })
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.status, "payment_review_required"))
          .orderBy(asc(schema.checkoutSessions.createdAt)),
    ),
    withAdmin(
      getDb(),
      { userId: SYSTEM_ACTOR, reason: "admin list duplicate charges" },
      async (tx) =>
        tx
          .select()
          .from(schema.duplicateCharges)
          .where(inArray(schema.duplicateCharges.status, ["detected", "refund_pending"]))
          .orderBy(asc(schema.duplicateCharges.detectedAt)),
    ),
  ])

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reconciliation</h1>
        <a href="/payouts" className="text-sm text-indigo-600 hover:underline">
          ← Back to payouts
        </a>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Negative commission orders ({negativeOrders.length})
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Completed orders where BOMY commission is negative. All shown regardless of payout status.
        </p>
        {negativeOrders.length === 0 ? (
          <p className="text-sm text-gray-400">None.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm text-gray-700">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-right">Seller payout</th>
                  <th className="px-4 py-3 text-left">Payout status</th>
                  <th className="px-4 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {negativeOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a
                        href={`/orders/${o.id}`}
                        className="font-mono text-indigo-600 hover:underline"
                      >
                        {o.id.slice(0, 8)}…
                      </a>
                    </td>
                    <td className="px-4 py-3">{o.storeName}</td>
                    <td className="px-4 py-3 text-right text-red-600">
                      −RM {senToMyr(-o.bomyCommissionSen)}
                    </td>
                    <td className="px-4 py-3 text-right">RM {senToMyr(o.sellerPayoutSen)}</td>
                    <td className="px-4 py-3 capitalize">{o.payoutStatus ?? "none"}</td>
                    <td className="px-4 py-3">{o.createdAt.toLocaleDateString("en-MY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Payment review queue ({reviewSessions.length})
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Checkout sessions awaiting admin resolution. Oldest first.
        </p>
        {reviewSessions.length === 0 ? (
          <p className="text-sm text-gray-400">Queue clear.</p>
        ) : (
          <ul className="space-y-3">
            {reviewSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-yellow-200 bg-yellow-50 px-6 py-4"
              >
                <div>
                  <p className="font-mono text-sm text-gray-700">{s.id.slice(0, 8)}…</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Reason: <code>{s.paymentReviewReason}</code> ·{" "}
                    {s.createdAt.toLocaleDateString("en-MY")}
                  </p>
                </div>
                <a
                  href={`/checkout-sessions/${s.id}`}
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  Review →
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Duplicate charges ({duplicateCharges.length})
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Payments received for an entitlement we will not honour. Refunding clears the
          liability:duplicate_charge_payable account.
        </p>
        {duplicateCharges.length === 0 ? (
          <p className="text-sm text-gray-400">None.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm text-gray-700">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Payment ID</th>
                  <th className="px-4 py-3 text-left">Detected</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {duplicateCharges.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-mono text-xs">{d.userId}</td>
                    <td className="px-4 py-3">
                      {d.subscriptionType === "member_subscription" ? "Membership" : "Brand"}
                    </td>
                    <td className="px-4 py-3 text-right">RM{senToMyr(d.amountSen)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.hitpayPaymentId}</td>
                    <td className="px-4 py-3">{d.detectedAt.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3">{d.status}</td>
                    <td className="px-4 py-3">
                      {d.status === "detected" && canRefund ? (
                        <RefundButton id={d.id} />
                      ) : d.status === "refund_pending" ? (
                        <span className="text-xs text-gray-400">Refund pending</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
