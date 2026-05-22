import { and, desc, eq } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"

import { PayoutActions } from "./_payout-actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

const PAYOUT_STATUSES = ["pending", "processing", "completed", "failed"] as const
type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function PayoutsPage({ searchParams }: Props) {
  const { status } = await searchParams

  const validStatus = PAYOUT_STATUSES.includes(status as PayoutStatus)
    ? (status as PayoutStatus)
    : undefined

  const payouts = await withAdmin(
    getDb(),
    { userId: SYSTEM_ACTOR, reason: "admin list payouts" },
    async (tx) => {
      const conditions = []
      if (validStatus) {
        conditions.push(eq(schema.orderPayouts.status, validStatus))
      }

      return tx
        .select({
          id: schema.orderPayouts.id,
          orderId: schema.orderPayouts.orderId,
          storeName: schema.stores.name,
          amountSen: schema.orderPayouts.amountSen,
          status: schema.orderPayouts.status,
          manualRef: schema.orderPayouts.manualRef,
          triggeredAt: schema.orderPayouts.triggeredAt,
          completedAt: schema.orderPayouts.completedAt,
        })
        .from(schema.orderPayouts)
        .innerJoin(schema.orders, eq(schema.orderPayouts.orderId, schema.orders.id))
        .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.orderPayouts.triggeredAt))
    },
  )

  const statuses = ["pending", "processing", "completed", "failed"]

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
        <a href="/payouts/reconciliation" className="text-sm text-indigo-600 hover:underline">
          Reconciliation →
        </a>
      </div>

      <div className="mb-6 flex gap-2">
        <a
          href="/payouts"
          className={`rounded-full px-3 py-1 text-sm ${!validStatus ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          All
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={`/payouts?status=${s}`}
            className={`rounded-full px-3 py-1 text-sm capitalize ${validStatus === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {s}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm text-gray-700">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Order</th>
              <th className="px-4 py-3 text-left">Store</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Ref</th>
              <th className="px-4 py-3 text-left">Triggered</th>
              <th className="px-4 py-3 text-left">Completed</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payouts.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <a
                    href={`/orders/${p.orderId}`}
                    className="font-mono text-indigo-600 hover:underline"
                  >
                    {p.orderId.slice(0, 8)}…
                  </a>
                </td>
                <td className="px-4 py-3">{p.storeName}</td>
                <td className="px-4 py-3 text-right">RM {senToMyr(p.amountSen)}</td>
                <td className="px-4 py-3 capitalize">{p.status}</td>
                <td className="px-4 py-3">{p.manualRef ?? "—"}</td>
                <td className="px-4 py-3">{p.triggeredAt.toLocaleDateString("en-MY")}</td>
                <td className="px-4 py-3">{p.completedAt?.toLocaleDateString("en-MY") ?? "—"}</td>
                <td className="px-4 py-3">
                  <PayoutActions payoutId={p.id} status={p.status} />
                </td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No payouts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
