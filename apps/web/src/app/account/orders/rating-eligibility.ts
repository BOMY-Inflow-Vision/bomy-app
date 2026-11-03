import { sql } from "drizzle-orm"

import type { Database } from "@bomy/db"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RatableProduct = { productId: string; storeId: string; storeOwnerId: string }

/**
 * The single eligibility rule for product ratings, shared by `rateProduct` and the order page so
 * the two cannot drift.
 *
 * Returns the product an order item may be rated for, or null unless the item belongs to an order
 * of `userId` that has arrived: `fulfilment_status IN ('delivered','completed')` (the
 * `order-auto-complete` job moves delivered → completed after 7 days) AND `delivered_at IS NOT
 * NULL`. Shipped, cancelled and every other status are not eligible.
 *
 * The product resolves via `variant_id → product_variants.product_id`; when the variant was
 * deleted (`variant_id` set null) it falls back to `product_snapshot->>'id'` (written by checkout
 * as the product uuid), which must still exist in `products`. Neither → null.
 *
 * Plain SQL with no bypass of its own: works inside both `withTenant` (buyer RLS lets the buyer
 * read their own order items and visible products) and `withAdmin`.
 */
export async function resolveRatableProduct(
  tx: Database,
  orderItemId: string,
  userId: string,
): Promise<RatableProduct | null> {
  if (!UUID_RE.test(orderItemId) || !UUID_RE.test(userId)) return null

  const rows = (await tx.execute(sql`
    SELECT p.id AS product_id, p.store_id, s.owner_id AS store_owner_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN product_variants pv ON pv.id = oi.variant_id
      JOIN products p ON p.id = COALESCE(
             pv.product_id,
             CASE WHEN oi.product_snapshot->>'id'
                       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN (oi.product_snapshot->>'id')::uuid
             END)
      JOIN stores s ON s.id = p.store_id
     WHERE oi.id = ${orderItemId}
       AND o.buyer_id = ${userId}
       AND o.fulfilment_status IN ('delivered', 'completed')
       AND o.delivered_at IS NOT NULL
     LIMIT 1
  `)) as unknown as Array<{ product_id: string; store_id: string; store_owner_id: string }>

  const row = rows[0]
  if (!row) return null
  return { productId: row.product_id, storeId: row.store_id, storeOwnerId: row.store_owner_id }
}
