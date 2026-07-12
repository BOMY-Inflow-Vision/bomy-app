import {
  ORDER_FULFILMENT_STATUSES,
  ORDER_PAYMENT_STATUSES,
  type OrderFulfilmentStatus,
  type OrderPaymentStatus,
} from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

import { fetchOrdersFiltered } from "./_queries"

interface Props {
  searchParams: Promise<{
    payment_status?: string
    fulfilment_status?: string
    store_id?: string
    date_from?: string
    date_to?: string
  }>
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const { id: adminId } = await requireAdmin()
  const params = await searchParams
  const filters: {
    paymentStatus?: OrderPaymentStatus
    fulfilmentStatus?: OrderFulfilmentStatus
    storeId?: string
    dateFrom?: string
    dateTo?: string
  } = {}
  if (
    params.payment_status &&
    ORDER_PAYMENT_STATUSES.includes(params.payment_status as OrderPaymentStatus)
  ) {
    filters.paymentStatus = params.payment_status as OrderPaymentStatus
  }
  if (
    params.fulfilment_status &&
    ORDER_FULFILMENT_STATUSES.includes(params.fulfilment_status as OrderFulfilmentStatus)
  ) {
    filters.fulfilmentStatus = params.fulfilment_status as OrderFulfilmentStatus
  }
  if (params.store_id) filters.storeId = params.store_id
  if (params.date_from) filters.dateFrom = params.date_from
  if (params.date_to) filters.dateTo = params.date_to
  const orders = await fetchOrdersFiltered(adminId, getDb(), filters)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Orders</h1>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-foreground">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Order ID</th>
              <th className="px-4 py-3 text-left">Store</th>
              <th className="px-4 py-3 text-left">Buyer</th>
              <th className="px-4 py-3 text-left">Payment</th>
              <th className="px-4 py-3 text-left">Fulfilment</th>
              <th className="px-4 py-3 text-right">Seller payout</th>
              <th className="px-4 py-3 text-right">Commission</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-muted/50">
                <td className="px-4 py-3 font-mono">{order.id.slice(0, 8)}&hellip;</td>
                <td className="px-4 py-3">{order.storeName}</td>
                <td className="px-4 py-3 font-mono">{order.buyerId.slice(0, 8)}&hellip;</td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="capitalize">
                    {order.paymentStatus}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="capitalize">
                    {order.fulfilmentStatus}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">RM {senToMyr(order.sellerPayoutSen)}</td>
                <td
                  className={cn(
                    "px-4 py-3 text-right",
                    order.bomyCommissionSen < 0n && "text-destructive",
                  )}
                >
                  {order.bomyCommissionSen < 0n ? "−" : ""}RM{" "}
                  {senToMyr(
                    order.bomyCommissionSen < 0n
                      ? -order.bomyCommissionSen
                      : order.bomyCommissionSen,
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {order.createdAt.toLocaleDateString("en-MY")}
                </td>
                <td className="px-4 py-3">
                  <a href={`/orders/${order.id}`} className="text-primary hover:underline">
                    View
                  </a>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
