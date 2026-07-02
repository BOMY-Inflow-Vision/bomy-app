import { notFound } from "next/navigation"

import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

import { fetchOrderWithDetail } from "../_queries"
import { CreatePayoutButton } from "./_create-payout-button"

interface Props {
  params: Promise<{ orderId: string }>
}

export default async function AdminOrderDetailPage({ params }: Props) {
  const { orderId } = await params
  const order = await fetchOrderWithDetail(getDb(), orderId)
  if (!order) notFound()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <a href="/orders" className="mb-6 block text-sm text-primary hover:underline">
        &larr; Back to orders
      </a>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Order {order.id.slice(0, 8)}&hellip;</h1>
        <div className="flex gap-2">
          <Badge variant="secondary" className="capitalize">
            {order.paymentStatus}
          </Badge>
          <Badge variant="accent" className="capitalize">
            {order.fulfilmentStatus}
          </Badge>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm text-foreground">
        <div>
          <span className="font-medium">Store:</span> {order.storeName}
        </div>
        <div>
          <span className="font-medium">Buyer ID:</span>{" "}
          <span className="font-mono">{order.buyerId.slice(0, 8)}&hellip;</span>
        </div>
        <div>
          <span className="font-medium">Session:</span>{" "}
          <a
            href={`/checkout-sessions/${order.checkoutSessionId}`}
            className="font-mono text-primary hover:underline"
          >
            {order.checkoutSessionId.slice(0, 8)}&hellip;
          </a>
        </div>
        <div>
          <span className="font-medium">Commission rate:</span> {order.bomyCommissionPct}%
        </div>
      </div>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Financials</h2>
        <div className="space-y-2 text-sm">
          {(
            [
              ["Retail subtotal", order.retailSubtotalSen],
              ["Brand discount", -order.brandDiscountSen],
              ["Discounted subtotal", order.discountedSubtotalSen],
              ["Voucher contribution", -order.voucherContributionSen],
              ["Shipping fee", order.shippingFeeSen],
              ["PSP fee allocated", order.pspFeeAllocatedSen],
              ["BOMY commission", order.bomyCommissionSen],
              ["Seller payout", order.sellerPayoutSen],
            ] as [string, bigint][]
          ).map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={cn("font-mono", val < 0n && "text-destructive")}>
                {val < 0n ? "−" : ""}RM {senToMyr(val < 0n ? -val : val)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Items</h2>
        <ul className="space-y-2 text-sm text-foreground">
          {order.items.map((item) => {
            const product = item.productSnapshot as { name?: string }
            const variant = item.variantSnapshot as { name?: string }
            return (
              <li key={item.id} className="flex justify-between">
                <span>
                  {product.name ?? "Product"} &mdash; {variant.name ?? "Default"} &times;{" "}
                  {item.quantity}
                </span>
                <span>RM {senToMyr(item.lineTotalSen)}</span>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="mb-6 p-6 text-sm text-foreground">
        <h2 className="mb-4 font-semibold text-foreground">Fulfilment timeline</h2>
        {order.shippedAt && (
          <p>
            Shipped: {order.shippedAt.toLocaleDateString("en-MY")} &mdash; {order.carrier}{" "}
            {order.trackingNumber}
          </p>
        )}
        {order.deliveredAt && <p>Delivered: {order.deliveredAt.toLocaleDateString("en-MY")}</p>}
        {order.completedAt && <p>Completed: {order.completedAt.toLocaleDateString("en-MY")}</p>}
      </Card>

      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Payout history</h2>
          {order.fulfilmentStatus === "completed" &&
            !order.payouts.some((p) =>
              (["pending", "processing", "completed"] as const).includes(
                p.status as "pending" | "processing" | "completed",
              ),
            ) && <CreatePayoutButton orderId={order.id} />}
        </div>
        {order.payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payouts yet.</p>
        ) : (
          <table className="w-full text-sm text-foreground">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2 text-left">Status</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-left">Ref</th>
                <th className="pb-2 text-left">Triggered</th>
                <th className="pb-2 text-left">Completed</th>
              </tr>
            </thead>
            <tbody>
              {order.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="py-1 capitalize">{p.status}</td>
                  <td className="py-1 text-right">RM {senToMyr(p.amountSen)}</td>
                  <td className="py-1">{p.manualRef ?? "—"}</td>
                  <td className="py-1">{p.triggeredAt.toLocaleDateString("en-MY")}</td>
                  <td className="py-1">{p.completedAt?.toLocaleDateString("en-MY") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
