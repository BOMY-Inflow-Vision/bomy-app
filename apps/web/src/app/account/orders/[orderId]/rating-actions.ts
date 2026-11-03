"use server"

import { sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import {
  makeDb,
  parseStars,
  RATING_WINDOW_HOURS,
  recomputeProductRating,
  withAdmin,
} from "@bomy/db"

import { auth } from "@/auth"

import { resolveRatableProduct } from "../rating-eligibility"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export type RateErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_STARS"
  | "NOT_ELIGIBLE"
  | "OWN_PRODUCT"
  | "WINDOW_CLOSED"
  | "RATING_REMOVED"

export type RateResult =
  | { ok: true; avg: string; count: number }
  | { ok: false; error: RateErrorCode }

/**
 * A buyer sets or changes their 1-5 star rating for the product behind one of their order items.
 *
 * Runs under `withAdmin` (precedent: `confirmDelivery`): rating writes are admin-bypass only under
 * RLS, and only the bypass path may write `products.rating_avg / rating_count`. The action itself
 * enforces every rule, all in one transaction and on the database clock:
 *   - eligibility through `resolveRatableProduct` (delivered / completed, this buyer's order);
 *   - a seller never rates a product of their own store (`stores.owner_id`);
 *   - the product row is locked first, so concurrent raters of one product queue up and each
 *     recompute (a later statement, fresh READ COMMITTED snapshot) sees every committed rating;
 *   - an admin-removed rating blocks the buyer for good (`RATING_REMOVED`);
 *   - a change is allowed only while `created_at + RATING_WINDOW_HOURS > now()`; the window
 *     counts from the first rating and a change never restarts it (`created_at` is not updated).
 */
export async function rateProduct(orderItemId: string, stars: unknown): Promise<RateResult> {
  const session = await auth()
  if (!session) return { ok: false, error: "UNAUTHENTICATED" }
  const userId = session.user.id

  const parsed = parseStars(stars)
  if (!parsed.ok) return { ok: false, error: "INVALID_STARS" }
  const value = parsed.value
  // Reject a non-string or malformed id before withAdmin, so it never opens a bypass transaction
  // (and never writes an audit row). Matches the admin rating actions.
  if (typeof orderItemId !== "string" || !UUID_RE.test(orderItemId)) {
    return { ok: false, error: "NOT_ELIGIBLE" }
  }

  const result = await withAdmin(
    getDb(),
    { userId, reason: "buyer rateProduct" },
    async (tx): Promise<RateResult> => {
      const target = await resolveRatableProduct(tx, orderItemId, userId)
      if (!target) return { ok: false, error: "NOT_ELIGIBLE" }
      if (target.storeOwnerId === userId) return { ok: false, error: "OWN_PRODUCT" }
      const { productId } = target

      // Lock the product before touching product_ratings, as its own statement.
      await tx.execute(sql`SELECT 1 FROM products WHERE id = ${productId} FOR UPDATE`)

      const existing = (await tx.execute(sql`
        SELECT removed_at FROM product_ratings
         WHERE product_id = ${productId} AND user_id = ${userId}
      `)) as unknown as Array<{ removed_at: Date | string | null }>
      if (existing[0] && existing[0].removed_at !== null) {
        return { ok: false, error: "RATING_REMOVED" }
      }

      const written = (await tx.execute(sql`
        INSERT INTO product_ratings (product_id, user_id, stars)
        VALUES (${productId}, ${userId}, ${value})
        ON CONFLICT (product_id, user_id) DO UPDATE
           SET stars = excluded.stars,
               updated_at = now()
         WHERE product_ratings.removed_at IS NULL
           AND product_ratings.created_at + make_interval(hours => ${RATING_WINDOW_HOURS}) > now()
        RETURNING id
      `)) as unknown as Array<{ id: string }>
      if (written.length === 0) {
        // Only an existing row can make the upsert return nothing; the product lock means no
        // other rating of this product changed since the SELECT above, so it is the window.
        return { ok: false, error: "WINDOW_CLOSED" }
      }

      const agg = await recomputeProductRating(tx, productId)
      return { ok: true, avg: agg.avg, count: agg.count }
    },
  )

  if (result.ok) revalidatePath("/account/orders/[orderId]", "page")
  return result
}
