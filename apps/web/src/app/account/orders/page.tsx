import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { senToMyr } from "@/lib/money"

import { AccountTabs } from "../account-tabs"
import { fetchBuyerOrders } from "./queries"

export default async function BuyerOrdersPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/account/orders")

  const orders = await fetchBuyerOrders(session.user.id)

  // Group by checkoutSessionId
  const grouped = new Map<string, typeof orders>()
  for (const order of orders) {
    const group = grouped.get(order.checkoutSessionId) ?? []
    group.push(order)
    grouped.set(order.checkoutSessionId, group)
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <AccountTabs active="orders" />
      <h1 className="mb-6 text-2xl font-bold text-gray-900">My Orders</h1>

      {grouped.size === 0 && <p className="text-sm text-gray-500">No orders yet.</p>}

      {[...grouped.entries()].map(([sessionId, sessionOrders]) => {
        const totalSen = sessionOrders.reduce(
          (sum, o) => sum + o.discountedSubtotalSen + o.shippingFeeSen - o.voucherContributionSen,
          0n,
        )
        return (
          <section key={sessionId} className="mb-8 rounded-xl border border-gray-200 p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Order group · {sessionOrders[0]?.createdAt.toLocaleDateString("en-MY")}
              </p>
              <p className="text-sm font-semibold text-gray-900">Total: RM {senToMyr(totalSen)}</p>
            </div>
            <ul className="space-y-3">
              {sessionOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{order.storeName}</p>
                    <span className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {order.fulfilmentStatus}
                    </span>
                  </div>
                  <a
                    href={`/account/orders/${order.id}`}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    View
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}
