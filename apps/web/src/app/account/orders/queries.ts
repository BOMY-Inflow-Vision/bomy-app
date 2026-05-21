import { desc, eq } from "drizzle-orm"

import { makeDb, schema, withTenant } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export type BuyerOrderListItem = {
  id: string
  checkoutSessionId: string
  storeName: string
  fulfilmentStatus: string
  createdAt: Date
  discountedSubtotalSen: bigint
  shippingFeeSen: bigint
  voucherContributionSen: bigint
}

export async function fetchBuyerOrders(userId: string): Promise<BuyerOrderListItem[]> {
  return withTenant(getDb(), { userId, userRole: "buyer" }, async (tx) =>
    tx
      .select({
        id: schema.orders.id,
        checkoutSessionId: schema.orders.checkoutSessionId,
        storeName: schema.stores.name,
        fulfilmentStatus: schema.orders.fulfilmentStatus,
        createdAt: schema.orders.createdAt,
        discountedSubtotalSen: schema.orders.discountedSubtotalSen,
        shippingFeeSen: schema.orders.shippingFeeSen,
        voucherContributionSen: schema.orders.voucherContributionSen,
      })
      .from(schema.orders)
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .where(eq(schema.orders.buyerId, userId))
      .orderBy(desc(schema.orders.createdAt)),
  )
}

export type BuyerOrderDetail = {
  id: string
  checkoutSessionId: string
  storeName: string
  fulfilmentStatus: string
  paymentStatus: string
  retailSubtotalSen: bigint
  brandDiscountSen: bigint
  discountedSubtotalSen: bigint
  voucherContributionSen: bigint
  shippingFeeSen: bigint
  carrier: string | null
  trackingNumber: string | null
  shippedAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
  items: Array<{
    id: string
    productSnapshot: unknown
    variantSnapshot: unknown
    quantity: number
    unitPriceSen: bigint
    lineTotalSen: bigint
  }>
}

export async function fetchBuyerOrderDetail(
  userId: string,
  orderId: string,
): Promise<BuyerOrderDetail | null> {
  const rows = await withTenant(getDb(), { userId, userRole: "buyer" }, async (tx) =>
    tx
      .select({
        id: schema.orders.id,
        checkoutSessionId: schema.orders.checkoutSessionId,
        storeName: schema.stores.name,
        fulfilmentStatus: schema.orders.fulfilmentStatus,
        paymentStatus: schema.orders.paymentStatus,
        retailSubtotalSen: schema.orders.retailSubtotalSen,
        brandDiscountSen: schema.orders.brandDiscountSen,
        discountedSubtotalSen: schema.orders.discountedSubtotalSen,
        voucherContributionSen: schema.orders.voucherContributionSen,
        shippingFeeSen: schema.orders.shippingFeeSen,
        carrier: schema.orders.carrier,
        trackingNumber: schema.orders.trackingNumber,
        shippedAt: schema.orders.shippedAt,
        deliveredAt: schema.orders.deliveredAt,
        createdAt: schema.orders.createdAt,
        buyerId: schema.orders.buyerId,
      })
      .from(schema.orders)
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .where(eq(schema.orders.id, orderId))
      .limit(1),
  )

  const order = rows[0]
  if (!order || order.buyerId !== userId) return null

  const items = await withTenant(getDb(), { userId, userRole: "buyer" }, async (tx) =>
    tx
      .select({
        id: schema.orderItems.id,
        productSnapshot: schema.orderItems.productSnapshot,
        variantSnapshot: schema.orderItems.variantSnapshot,
        quantity: schema.orderItems.quantity,
        unitPriceSen: schema.orderItems.unitPriceSen,
        lineTotalSen: schema.orderItems.lineTotalSen,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId)),
  )

  return { ...order, items }
}
