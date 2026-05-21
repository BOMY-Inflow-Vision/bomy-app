import { notFound, redirect } from "next/navigation"

import { auth } from "@/auth"
import { senToMyr } from "@/lib/money"

import { fetchBuyerOrderDetail } from "../queries"
import { ConfirmDeliveryButton } from "./_confirm-delivery-button"

interface Props {
  params: Promise<{ orderId: string }>
}

export default async function BuyerOrderDetailPage({ params }: Props) {
  const { orderId } = await params
  const session = await auth()
  if (!session) redirect(`/auth/sign-in?callbackUrl=/account/orders/${orderId}`)

  const order = await fetchBuyerOrderDetail(session.user.id, orderId)
  if (!order) notFound()

  const totalPaidSen =
    order.discountedSubtotalSen + order.shippingFeeSen - order.voucherContributionSen

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <a href="/account/orders" className="mb-6 block text-sm text-indigo-600 hover:underline">
        ← Back to orders
      </a>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{order.storeName}</h1>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
          {order.fulfilmentStatus}
        </span>
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Items</h2>
        <ul className="space-y-2">
          {order.items.map((item) => {
            const product = item.productSnapshot as { name?: string }
            const variant = item.variantSnapshot as { name?: string }
            return (
              <li key={item.id} className="flex justify-between text-sm text-gray-700">
                <span>
                  {product.name ?? "Product"} — {variant.name ?? "Default"} × {item.quantity}
                </span>
                <span>RM {senToMyr(item.lineTotalSen)}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 p-6 space-y-2 text-sm text-gray-700">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>RM {senToMyr(order.retailSubtotalSen)}</span>
        </div>
        {order.brandDiscountSen > 0n && (
          <div className="flex justify-between text-green-700">
            <span>Brand discount</span>
            <span>−RM {senToMyr(order.brandDiscountSen)}</span>
          </div>
        )}
        {order.voucherContributionSen > 0n && (
          <div className="flex justify-between text-green-700">
            <span>Voucher</span>
            <span>−RM {senToMyr(order.voucherContributionSen)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Shipping</span>
          <span>RM {senToMyr(order.shippingFeeSen)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
          <span>Total paid</span>
          <span>RM {senToMyr(totalPaidSen)}</span>
        </div>
      </section>

      {(order.carrier || order.trackingNumber) && (
        <section className="mb-6 rounded-xl border border-gray-200 p-6 text-sm text-gray-700">
          <h2 className="mb-2 font-semibold text-gray-900">Tracking</h2>
          {order.carrier && <p>Carrier: {order.carrier}</p>}
          {order.trackingNumber && <p>Tracking: {order.trackingNumber}</p>}
          {order.shippedAt && <p>Shipped: {order.shippedAt.toLocaleDateString("en-MY")}</p>}
        </section>
      )}

      {order.deliveredAt && (
        <p className="mb-6 text-sm text-gray-600">
          Delivered: {order.deliveredAt.toLocaleDateString("en-MY")}
        </p>
      )}

      {order.fulfilmentStatus === "shipped" && <ConfirmDeliveryButton orderId={order.id} />}
    </main>
  )
}
