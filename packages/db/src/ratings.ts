import { sql } from "drizzle-orm"

import type { Database } from "./client.js"

/**
 * Hours a buyer may change their rating, counted from the first rating (`created_at`). A change
 * never restarts the window. The single source of this number: SQL receives it through
 * `make_interval(hours => ...)` and never carries its own literal.
 */
export const RATING_WINDOW_HOURS = 24

export type Stars = 1 | 2 | 3 | 4 | 5

export type ParseStarsResult = { ok: true; value: Stars } | { ok: false; errors: { stars: string } }

/**
 * Validates a stars value from an untrusted request. Accepts only the numbers 1-5 as whole
 * integers; rejects strings (even `"5"`), fractions, NaN, null and undefined.
 */
export function parseStars(input: unknown): ParseStarsResult {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1 || input > 5) {
    return { ok: false, errors: { stars: "Choose 1 to 5 stars." } }
  }
  return { ok: true, value: input as Stars }
}

/**
 * Recomputes the cached rating aggregate on `products` from `product_ratings`, ignoring removed
 * rows, and returns what was stored (`avg` as the numeric(3,2) text, e.g. `"4.50"`).
 *
 * Locks the product row `FOR UPDATE` first, so two buyers rating the same product at the same
 * time serialise and both are counted. Rounds once, in SQL, to 1 decimal.
 *
 * Must run inside `withAdmin`, in the same transaction as the rating write: it is the only writer
 * of `rating_avg` / `rating_count`, and the `products_guard_rating_columns` trigger (migration
 * 0035) rejects the update on any non-bypass path.
 */
export async function recomputeProductRating(
  tx: Database,
  productId: string,
): Promise<{ avg: string; count: number }> {
  const locked = (await tx.execute(
    sql`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`,
  )) as unknown as Array<{ id: string }>
  if (locked.length === 0) {
    throw new Error(`recomputeProductRating: product ${productId} not found`)
  }

  const rows = (await tx.execute(sql`
    UPDATE products p
       SET rating_avg = agg.avg,
           rating_count = agg.count
      FROM (
        SELECT COALESCE(ROUND(AVG(stars)::numeric, 1), 0) AS avg,
               COUNT(*)::int AS count
          FROM product_ratings
         WHERE product_id = ${productId}
           AND removed_at IS NULL
      ) agg
     WHERE p.id = ${productId}
    RETURNING p.rating_avg::text AS avg, p.rating_count AS count
  `)) as unknown as Array<{ avg: string; count: number }>

  const row = rows[0]
  if (!row) throw new Error(`recomputeProductRating: product ${productId} not updated`)
  return { avg: row.avg, count: Number(row.count) }
}
