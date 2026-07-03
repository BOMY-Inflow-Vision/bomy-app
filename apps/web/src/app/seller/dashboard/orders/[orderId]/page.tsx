import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { senToMyr } from "@/lib/money"

import { fetchSellerOrderDetail } from "../queries"
import { EnterTrackingForm } from "./_enter-tracking-form"
import { MarkDeliveredButton } from "./_mark-delivered-button"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

interface Props {
  params: Promise<{ orderId: string }>
}

export default async function SellerOrderDetailPage({ params }: Props) {
  const { orderId } = await params
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

  const order = await fetchSellerOrderDetail(session.user.id, store.id, orderId)
  if (!order) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <a
        href="/seller/dashboard/orders"
        className="mb-6 block text-sm text-primary hover:underline"
      >
        ← Back to orders
      </a>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Order {order.id.slice(0, 8)}…</h1>
        <span className="rounded-full bg-accent px-3 py-1 text-sm font-medium capitalize text-accent-foreground">
          {order.fulfilmentStatus}
        </span>
      </div>

      <section className="mb-6 rounded-xl border border-border p-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Items</h2>
        <ul className="space-y-2">
          {order.items.map((item) => {
            const product = item.productSnapshot as { name?: string }
            const variant = item.variantSnapshot as { name?: string }
            return (
              <li key={item.id} className="flex justify-between text-sm text-foreground">
                <span>
                  {product.name ?? "Product"} — {variant.name ?? "Default"} × {item.quantity}
                </span>
                <span>RM {senToMyr(item.lineTotalSen)}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mb-6 space-y-2 rounded-xl border border-border p-6 text-sm text-foreground">
        <div className="flex justify-between font-semibold text-foreground">
          <span>Your payout</span>
          <span>RM {senToMyr(order.sellerPayoutSen)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Payment processing fee</span>
          <span>RM {senToMyr(order.pspFeeAllocatedSen)}</span>
        </div>
      </section>

      {(order.fulfilmentStatus === "processing" || order.fulfilmentStatus === "shipped") && (
        <section className="mb-6">
          <EnterTrackingForm
            orderId={order.id}
            currentCarrier={order.carrier}
            currentTracking={order.trackingNumber}
          />
        </section>
      )}

      {order.fulfilmentStatus === "shipped" && <MarkDeliveredButton orderId={order.id} />}
    </div>
  )
}
