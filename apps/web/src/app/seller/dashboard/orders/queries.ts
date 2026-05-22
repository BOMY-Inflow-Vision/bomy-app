import { and, desc, eq } from "drizzle-orm"

import { makeDb, schema, withTenant } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export type SellerOrderListItem = {
  id: string
  itemCount: number
  fulfilmentStatus: string
  sellerPayoutSen: bigint
  createdAt: Date
}

export async function fetchSellerOrders(
  userId: string,
  storeId: string,
  statusFilter?: string,
): Promise<SellerOrderListItem[]> {
  const rows = await withTenant(
    getDb(),
    { userId, userRole: "seller_owner", sellerId: storeId },
    async (tx) => {
      const query = tx
        .select({
          id: schema.orders.id,
          fulfilmentStatus: schema.orders.fulfilmentStatus,
          sellerPayoutSen: schema.orders.sellerPayoutSen,
          createdAt: schema.orders.createdAt,
        })
        .from(schema.orders)
        .where(
          statusFilter
            ? and(
                eq(schema.orders.storeId, storeId),
                eq(
                  schema.orders.fulfilmentStatus,
                  statusFilter as
                    | "cancelled"
                    | "processing"
                    | "shipped"
                    | "delivered"
                    | "completed",
                ),
              )
            : eq(schema.orders.storeId, storeId),
        )
        .orderBy(desc(schema.orders.createdAt))
      return query
    },
  )
  return rows.map((r) => ({ ...r, itemCount: 0 }))
}

export type SellerOrderDetail = {
  id: string
  fulfilmentStatus: string
  shippingAddress: unknown
  sellerPayoutSen: bigint
  pspFeeAllocatedSen: bigint
  carrier: string | null
  trackingNumber: string | null
  shippedAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
  storeId: string
  items: Array<{
    id: string
    productSnapshot: unknown
    variantSnapshot: unknown
    quantity: number
    unitPriceSen: bigint
    lineTotalSen: bigint
  }>
}

export async function fetchSellerOrderDetail(
  userId: string,
  storeId: string,
  orderId: string,
): Promise<SellerOrderDetail | null> {
  const rows = await withTenant(
    getDb(),
    { userId, userRole: "seller_owner", sellerId: storeId },
    async (tx) =>
      tx
        .select({
          id: schema.orders.id,
          fulfilmentStatus: schema.orders.fulfilmentStatus,
          shippingAddress: schema.orders.shippingAddress,
          sellerPayoutSen: schema.orders.sellerPayoutSen,
          pspFeeAllocatedSen: schema.orders.pspFeeAllocatedSen,
          carrier: schema.orders.carrier,
          trackingNumber: schema.orders.trackingNumber,
          shippedAt: schema.orders.shippedAt,
          deliveredAt: schema.orders.deliveredAt,
          createdAt: schema.orders.createdAt,
          storeId: schema.orders.storeId,
        })
        .from(schema.orders)
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.storeId, storeId)))
        .limit(1),
  )

  const order = rows[0]
  if (!order) return null

  const items = await withTenant(
    getDb(),
    { userId, userRole: "seller_owner", sellerId: storeId },
    async (tx) =>
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
