import { eq } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Eye } from "lucide-react"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { Badge } from "@bomy/ui/badge"
import { Button } from "@bomy/ui/button"
import { FilterTab, FilterTabs } from "@bomy/ui/filter-tabs"
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
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Orders</h1>

      <FilterTabs label="Filter by status" className="mb-6 gap-2">
        <FilterTab asChild variant="inverse" active={!validStatus}>
          <Link href="/seller/dashboard/orders">All</Link>
        </FilterTab>
        {statuses.map((s) => (
          <FilterTab
            key={s}
            asChild
            variant="inverse"
            active={validStatus === s}
            className="capitalize"
          >
            <Link href={`/seller/dashboard/orders?status=${s}`}>{s}</Link>
          </FilterTab>
        ))}
      </FilterTabs>

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
                <Badge variant="accent" className="mt-1 capitalize">
                  {order.fulfilmentStatus}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  RM {senToMyr(order.sellerPayoutSen)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.createdAt.toLocaleDateString("en-MY")}
                </p>
              </div>
              <Button variant="link" size="sm" icon={<Eye />} className="ml-6" asChild>
                <a href={`/seller/dashboard/orders/${order.id}`}>View</a>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
