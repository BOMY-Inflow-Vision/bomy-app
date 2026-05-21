import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { makeDb, schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { senToMyr } from "@/lib/money"

import { fetchSellerOrders } from "./queries"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function SellerOrdersPage({ searchParams }: Props) {
  const { status } = await searchParams
  const session = await auth()
  if (!session || session.user.role !== "seller_owner") {
    redirect("/auth/sign-in")
  }

  const [store] = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "seller resolve store" },
    async (tx) =>
      tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, session.user.id))
        .limit(1),
  )
  if (!store) redirect("/seller/dashboard")

  const orders = await fetchSellerOrders(session.user.id, store.id, status)

  const statuses = ["processing", "shipped", "delivered", "completed", "cancelled"]

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Orders</h1>

      <div className="mb-6 flex gap-2">
        <a
          href="/seller/dashboard/orders"
          className={`rounded-full px-3 py-1 text-sm ${!status ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          All
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={`/seller/dashboard/orders?status=${s}`}
            className={`rounded-full px-3 py-1 text-sm capitalize ${status === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {s}
          </a>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">No orders.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 px-6 py-4"
            >
              <div>
                <p className="font-mono text-sm text-gray-500">{order.id.slice(0, 8)}…</p>
                <span className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium capitalize text-indigo-700">
                  {order.fulfilmentStatus}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  RM {senToMyr(order.sellerPayoutSen)}
                </p>
                <p className="text-xs text-gray-400">
                  {order.createdAt.toLocaleDateString("en-MY")}
                </p>
              </div>
              <a
                href={`/seller/dashboard/orders/${order.id}`}
                className="ml-6 text-sm font-medium text-indigo-600 hover:underline"
              >
                View
              </a>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
