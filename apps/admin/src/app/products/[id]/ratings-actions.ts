"use server"

import { sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { parseStars, recomputeProductRating, withAdmin } from "@bomy/db"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"

export type AdminRatingErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_STARS"
  | "REASON_REQUIRED"
  | "NOT_FOUND"
  | "ALREADY_REMOVED"

export type AdminRatingResult =
  | { ok: true; avg: string; count: number }
  | { ok: false; error: AdminRatingErrorCode }

/** Ops and admin only; finance, sellers and buyers are refused. */
const RATING_OVERRIDE_ROLES = ["bomy_ops", "bomy_admin"] as const

/** Longest reason kept (audit row and `removal_reason`); anything after is cut off. */
const MAX_REASON_LENGTH = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Tx = Parameters<Parameters<typeof withAdmin>[2]>[0]

type Locked = { ok: true; productId: string; removed: boolean } | { ok: false; error: "NOT_FOUND" }

async function authorize(): Promise<{ ok: true; adminId: string } | { ok: false }> {
  try {
    const authz = await authorizeAdminAction({ roles: RATING_OVERRIDE_ROLES })
    return authz.ok ? { ok: true, adminId: authz.adminId } : { ok: false }
  } catch {
    // authorizeAdminAction rethrows anything unexpected (e.g. a failed session read); this
    // action never throws across the boundary, and an unverifiable caller is not authorised.
    return { ok: false }
  }
}

function cleanReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null
  const trimmed = reason.trim().slice(0, MAX_REASON_LENGTH).trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Same lock order as the buyer's rateProduct: the product row first, then the rating row, so a
 * buyer and an admin writing ratings of one product queue up on the product lock and never
 * deadlock. The product id comes from a plain read; it cannot change (no code updates it).
 */
async function lockRating(tx: Tx, ratingId: string): Promise<Locked> {
  const found = (await tx.execute(
    sql`SELECT product_id FROM product_ratings WHERE id = ${ratingId}`,
  )) as unknown as Array<{ product_id: string }>
  const productId = found[0]?.product_id
  if (!productId) return { ok: false, error: "NOT_FOUND" }

  await tx.execute(sql`SELECT 1 FROM products WHERE id = ${productId} FOR UPDATE`)

  const rows = (await tx.execute(sql`
    SELECT removed_at FROM product_ratings
     WHERE id = ${ratingId} AND product_id = ${productId}
       FOR UPDATE
  `)) as unknown as Array<{ removed_at: Date | string | null }>
  const row = rows[0]
  if (!row) return { ok: false, error: "NOT_FOUND" }
  return { ok: true, productId, removed: row.removed_at !== null }
}

/**
 * bomy_ops / bomy_admin set a rating's stars, at any time: the buyer's 24-hour window does not
 * apply, and `created_at` is left alone (`updated_at = now()`). A removed rating cannot be edited.
 * Audited through withAdmin with the rating id and the written reason.
 */
export async function adminSetRating(
  ratingId: string,
  stars: unknown,
  reason: string,
): Promise<AdminRatingResult> {
  const authz = await authorize()
  if (!authz.ok) return { ok: false, error: "UNAUTHORIZED" }

  const parsed = parseStars(stars)
  if (!parsed.ok) return { ok: false, error: "INVALID_STARS" }
  const why = cleanReason(reason)
  if (!why) return { ok: false, error: "REASON_REQUIRED" }
  if (typeof ratingId !== "string" || !UUID_RE.test(ratingId)) {
    return { ok: false, error: "NOT_FOUND" }
  }
  const value = parsed.value

  const result = await withAdmin(
    getDb(),
    { userId: authz.adminId, reason: `admin rating set ${ratingId}: ${why}` },
    async (tx): Promise<AdminRatingResult & { productId?: string }> => {
      const locked = await lockRating(tx, ratingId)
      if (!locked.ok) return locked
      if (locked.removed) return { ok: false, error: "ALREADY_REMOVED" }

      await tx.execute(sql`
        UPDATE product_ratings
           SET stars = ${value}, updated_at = now()
         WHERE id = ${ratingId}
      `)
      const agg = await recomputeProductRating(tx, locked.productId)
      return { ok: true, avg: agg.avg, count: agg.count, productId: locked.productId }
    },
  )

  return finish(result)
}

/**
 * bomy_ops / bomy_admin remove a rating on a seller dispute. Soft delete only: `removed_at`,
 * `removed_by`, `removal_reason` are set and the row stays, so the buyer cannot rate the product
 * again (rateProduct returns RATING_REMOVED). The aggregate drops it in the same transaction.
 */
export async function adminRemoveRating(
  ratingId: string,
  reason: string,
): Promise<AdminRatingResult> {
  const authz = await authorize()
  if (!authz.ok) return { ok: false, error: "UNAUTHORIZED" }

  const why = cleanReason(reason)
  if (!why) return { ok: false, error: "REASON_REQUIRED" }
  if (typeof ratingId !== "string" || !UUID_RE.test(ratingId)) {
    return { ok: false, error: "NOT_FOUND" }
  }
  const adminId = authz.adminId

  const result = await withAdmin(
    getDb(),
    { userId: adminId, reason: `admin rating remove ${ratingId}: ${why}` },
    async (tx): Promise<AdminRatingResult & { productId?: string }> => {
      const locked = await lockRating(tx, ratingId)
      if (!locked.ok) return locked
      if (locked.removed) return { ok: false, error: "ALREADY_REMOVED" }

      await tx.execute(sql`
        UPDATE product_ratings
           SET removed_at = now(), removed_by = ${adminId}, removal_reason = ${why}
         WHERE id = ${ratingId}
      `)
      const agg = await recomputeProductRating(tx, locked.productId)
      return { ok: true, avg: agg.avg, count: agg.count, productId: locked.productId }
    },
  )

  return finish(result)
}

function finish(result: AdminRatingResult & { productId?: string }): AdminRatingResult {
  if (!result.ok) return { ok: false, error: result.error }
  // Admin's own cache only; apps/web is a separate deployment (see updateProductSeo).
  if (result.productId) revalidatePath(`/products/${result.productId}`)
  return { ok: true, avg: result.avg, count: result.count }
}
