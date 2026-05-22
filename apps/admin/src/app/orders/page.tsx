import {
  ORDER_FULFILMENT_STATUSES,
  ORDER_PAYMENT_STATUSES,
  type OrderFulfilmentStatus,
  type OrderPaymentStatus,
} from "@bomy/db"

import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"

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
  const orders = await fetchOrdersFiltered(getDb(), filters)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Orders</h1>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm text-gray-700">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
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
          <tbody className="divide-y divide-gray-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono">{order.id.slice(0, 8)}&hellip;</td>
                <td className="px-4 py-3">{order.storeName}</td>
                <td className="px-4 py-3 font-mono">{order.buyerId.slice(0, 8)}&hellip;</td>
                <td className="px-4 py-3 capitalize">{order.paymentStatus}</td>
                <td className="px-4 py-3 capitalize">{order.fulfilmentStatus}</td>
                <td className="px-4 py-3 text-right">RM {senToMyr(order.sellerPayoutSen)}</td>
                <td
                  className={`px-4 py-3 text-right ${order.bomyCommissionSen < 0n ? "text-red-600" : ""}`}
                >
                  {order.bomyCommissionSen < 0n ? "−" : ""}RM{" "}
                  {senToMyr(
                    order.bomyCommissionSen < 0n
                      ? -order.bomyCommissionSen
                      : order.bomyCommissionSen,
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {order.createdAt.toLocaleDateString("en-MY")}
                </td>
                <td className="px-4 py-3">
                  <a href={`/orders/${order.id}`} className="text-indigo-600 hover:underline">
                    View
                  </a>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
