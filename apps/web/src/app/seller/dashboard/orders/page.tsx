import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { senToMyr } from "@/lib/money"
import { cn } from "@/lib/utils"

import { fetchSellerOrders } from "./queries"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

const SELLER_ORDER_STATUSES = [
  "processing",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
] as const
type SellerOrderStatus = (typeof SELLER_ORDER_STATUSES)[number]

export default async function SellerOrdersPage({ searchParams }: Props) {
  const { status } = await searchParams
  const validStatus = SELLER_ORDER_STATUSES.includes(status as SellerOrderStatus)
    ? (status as SellerOrderStatus)
    : undefined
  const session = await auth()
  if (!session || session.user.role !== "seller_owner") {
    redirect("/auth/sign-in")
  }

  const [store] = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, session.user.id))
        .limit(1),
  )
  if (!store) redirect("/seller/dashboard")

  const orders = await fetchSellerOrders(session.user.id, store.id, validStatus)

  const statuses = ["processing", "shipped", "delivered", "completed", "cancelled"]

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Orders</h1>

      <div className="mb-6 flex gap-2">
        <a
          href="/seller/dashboard/orders"
          className={cn(
            "rounded-full px-3 py-1 text-sm",
            !validStatus ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          All
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={`/seller/dashboard/orders?status=${s}`}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize",
              validStatus === s
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
          >
            {s}
          </a>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-xl border border-border px-6 py-4"
            >
              <div>
                <p className="font-mono text-sm text-muted-foreground">{order.id.slice(0, 8)}…</p>
                <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-medium capitalize text-accent-foreground">
                  {order.fulfilmentStatus}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  RM {senToMyr(order.sellerPayoutSen)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.createdAt.toLocaleDateString("en-MY")}
                </p>
              </div>
              <a
                href={`/seller/dashboard/orders/${order.id}`}
                className="ml-6 text-sm font-medium text-primary hover:underline"
              >
                View
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
