import { asc, eq } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"

import { fetchNegativeCommissionOrders } from "../../orders/_queries"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

export default async function ReconciliationPage() {
  const [negativeOrders, reviewSessions] = await Promise.all([
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
    </main>
  )
}
