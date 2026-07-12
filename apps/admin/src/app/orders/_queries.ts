import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"
import type { OrderFulfilmentStatus, OrderPaymentStatus } from "@bomy/db"

export interface OrderFilters {
  paymentStatus?: string
  fulfilmentStatus?: string
  storeId?: string
  dateFrom?: string
  dateTo?: string
}

export type AdminOrderListItem = {
  id: string
  storeName: string
  buyerId: string
  paymentStatus: string
  fulfilmentStatus: string
  sellerPayoutSen: bigint
  bomyCommissionSen: bigint
  createdAt: Date
}

export async function fetchOrdersFiltered(
  actorId: string,
  db: Database,
  filters: OrderFilters,
): Promise<AdminOrderListItem[]> {
  return withAdmin(db, { userId: actorId, reason: "admin fetchOrdersFiltered" }, async (tx) => {
    const conditions = []
    if (filters.paymentStatus) {
      conditions.push(eq(schema.orders.paymentStatus, filters.paymentStatus as OrderPaymentStatus))
    }
    if (filters.fulfilmentStatus) {
      conditions.push(
        eq(schema.orders.fulfilmentStatus, filters.fulfilmentStatus as OrderFulfilmentStatus),
      )
    }
    if (filters.storeId) {
      conditions.push(eq(schema.orders.storeId, filters.storeId))
    }
    if (filters.dateFrom) {
      conditions.push(gte(schema.orders.createdAt, new Date(filters.dateFrom)))
    }
    if (filters.dateTo) {
      conditions.push(lte(schema.orders.createdAt, new Date(filters.dateTo)))
    }

    return tx
      .select({
        id: schema.orders.id,
        storeName: schema.stores.name,
        buyerId: schema.orders.buyerId,
        paymentStatus: schema.orders.paymentStatus,
        fulfilmentStatus: schema.orders.fulfilmentStatus,
        sellerPayoutSen: schema.orders.sellerPayoutSen,
        bomyCommissionSen: schema.orders.bomyCommissionSen,
        createdAt: schema.orders.createdAt,
      })
      .from(schema.orders)
      .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.orders.createdAt))
  })
}

export type AdminOrderDetail = {
  id: string
  checkoutSessionId: string
  storeName: string
  buyerId: string
  paymentStatus: string
  fulfilmentStatus: string
  retailSubtotalSen: bigint
  brandDiscountSen: bigint
  discountedSubtotalSen: bigint
  voucherContributionSen: bigint
  shippingFeeSen: bigint
  pspFeeAllocatedSen: bigint
  bomyCommissionSen: bigint
  bomyCommissionPct: number
  sellerPayoutSen: bigint
  carrier: string | null
  trackingNumber: string | null
  shippedAt: Date | null
  deliveredAt: Date | null
  completedAt: Date | null
  createdAt: Date
  items: Array<{
    id: string
    productSnapshot: unknown
    variantSnapshot: unknown
    quantity: number
    unitPriceSen: bigint
    lineTotalSen: bigint
  }>
  payouts: Array<{
    id: string
    status: string
    amountSen: bigint
    manualRef: string | null
    triggeredAt: Date
    completedAt: Date | null
  }>
}

export async function fetchOrderWithDetail(
  actorId: string,
  db: Database,
  orderId: string,
): Promise<AdminOrderDetail | null> {
  const rows = await withAdmin(
    db,
    { userId: actorId, reason: "admin fetchOrderWithDetail" },
    async (tx) =>
      tx
        .select({
          id: schema.orders.id,
          checkoutSessionId: schema.orders.checkoutSessionId,
          storeName: schema.stores.name,
          buyerId: schema.orders.buyerId,
          paymentStatus: schema.orders.paymentStatus,
          fulfilmentStatus: schema.orders.fulfilmentStatus,
          retailSubtotalSen: schema.orders.retailSubtotalSen,
          brandDiscountSen: schema.orders.brandDiscountSen,
          discountedSubtotalSen: schema.orders.discountedSubtotalSen,
          voucherContributionSen: schema.orders.voucherContributionSen,
          shippingFeeSen: schema.orders.shippingFeeSen,
          pspFeeAllocatedSen: schema.orders.pspFeeAllocatedSen,
          bomyCommissionSen: schema.orders.bomyCommissionSen,
          bomyCommissionPct: schema.orders.bomyCommissionPct,
          sellerPayoutSen: schema.orders.sellerPayoutSen,
          carrier: schema.orders.carrier,
          trackingNumber: schema.orders.trackingNumber,
          shippedAt: schema.orders.shippedAt,
          deliveredAt: schema.orders.deliveredAt,
          completedAt: schema.orders.completedAt,
          createdAt: schema.orders.createdAt,
        })
        .from(schema.orders)
        .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
        .where(eq(schema.orders.id, orderId))
        .limit(1),
  )

  const order = rows[0]
  if (!order) return null

  const [items, payouts] = await withAdmin(
    db,
    { userId: actorId, reason: "admin fetchOrderDetail items+payouts" },
    async (tx) => {
      const i = await tx
        .select({
          id: schema.orderItems.id,
          productSnapshot: schema.orderItems.productSnapshot,
          variantSnapshot: schema.orderItems.variantSnapshot,
          quantity: schema.orderItems.quantity,
          unitPriceSen: schema.orderItems.unitPriceSen,
          lineTotalSen: schema.orderItems.lineTotalSen,
        })
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, orderId))

      const p = await tx
        .select({
          id: schema.orderPayouts.id,
          status: schema.orderPayouts.status,
          amountSen: schema.orderPayouts.amountSen,
          manualRef: schema.orderPayouts.manualRef,
          triggeredAt: schema.orderPayouts.triggeredAt,
          completedAt: schema.orderPayouts.completedAt,
        })
        .from(schema.orderPayouts)
        .where(eq(schema.orderPayouts.orderId, orderId))

      return [i, p] as const
    },
  )

  return { ...order, items, payouts }
}

export async function fetchNegativeCommissionOrders(actorId: string, db: Database) {
  return withAdmin(
    db,
    { userId: actorId, reason: "admin fetchNegativeCommissionOrders" },
    async (tx) =>
      tx
        .select({
          id: schema.orders.id,
          storeName: schema.stores.name,
          bomyCommissionSen: schema.orders.bomyCommissionSen,
          sellerPayoutSen: schema.orders.sellerPayoutSen,
          createdAt: schema.orders.createdAt,
          payoutStatus: sql<string | null>`(
            SELECT status FROM order_payouts
            WHERE order_id = ${schema.orders.id}
            ORDER BY triggered_at DESC
            LIMIT 1
          )`,
        })
        .from(schema.orders)
        .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
        .where(
          and(
            sql`${schema.orders.bomyCommissionSen} < 0`,
            eq(schema.orders.fulfilmentStatus, "completed"),
          ),
        )
        .orderBy(schema.orders.bomyCommissionSen),
  )
}
