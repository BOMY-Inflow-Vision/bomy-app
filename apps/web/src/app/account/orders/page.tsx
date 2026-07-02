import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { Badge } from "@/components/ui/badge"
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
      <h1 className="mb-6 text-2xl font-bold text-foreground">My Orders</h1>

      {grouped.size === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}

      {[...grouped.entries()].map(([sessionId, sessionOrders]) => {
        const totalSen = sessionOrders.reduce(
          (sum, o) => sum + o.discountedSubtotalSen + o.shippingFeeSen - o.voucherContributionSen,
          0n,
        )
        return (
          <section key={sessionId} className="mb-8 rounded-xl border border-border p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Order group · {sessionOrders[0]?.createdAt.toLocaleDateString("en-MY")}
              </p>
              <p className="text-sm font-semibold text-foreground">
                Total: RM {senToMyr(totalSen)}
              </p>
            </div>
            <ul className="space-y-3">
              {sessionOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.storeName}</p>
                    <Badge variant="accent" className="mt-1">
                      {order.fulfilmentStatus}
                    </Badge>
                  </div>
                  <a
                    href={`/account/orders/${order.id}`}
                    className="text-sm font-medium text-primary hover:underline"
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
