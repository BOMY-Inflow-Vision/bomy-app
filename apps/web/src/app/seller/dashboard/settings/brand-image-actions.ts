"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { clampFocal, isFocalInput } from "@/lib/focal"

// The brand tile picture: upload, replace, remove, and choose its focal point. Mirrors the product
// picture actions (products/actions.ts) but the picture lives on the store row itself, so every
// write locks that row FOR UPDATE and changes the url and the focal point in one transaction.

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]
const MAX_BYTES = 2 * 1024 * 1024
const KEY_PATTERN =
  /^brands\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/

export type BrandImage = { imageUrl: string | null; focalX: number; focalY: number }
export type BrandImageResult = ({ ok: true } & BrandImage) | { ok: false; error: string }

async function requireSeller() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")
  return session
}

function revalidate(slug: string) {
  revalidatePath("/seller/dashboard/settings")
  revalidatePath(`/brands/${slug}`)
  revalidatePath("/brands")
  revalidatePath("/")
}

// Delete a replaced / removed object once the response has gone. A failed delete only leaves an
// orphan in the bucket, so it is logged, never surfaced to the seller.
function deleteLater(oldUrl: string | null) {
  if (!oldUrl) return
  after(async () => {
    try {
      const { keyFromPublicUrl, deleteObject } = await import("@/lib/s3")
      const key = keyFromPublicUrl(oldUrl)
      if (key) await deleteObject(key)
    } catch (err) {
      console.error("brand image cleanup failed", err)
    }
  })
}

export async function getBrandImageUploadUrl(
  contentType: string,
  contentLength: number,
): Promise<{ url: string; key: string; claim: string } | { error: string }> {
  const session = await requireSeller()
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) return { error: "Unsupported image type" }
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > MAX_BYTES) {
    return { error: "File must be between 1 byte and 2 MB" }
  }

  const stores = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    (tx) =>
      tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
        .limit(1),
  )
  if (!stores[0]) return { error: "Store is not active" }

  const { createPresignedPutUrl, signUploadClaim } = await import("@/lib/s3")
  const { url, key } = await createPresignedPutUrl(contentType, contentLength, "brands")
  return { url, key, claim: signUploadClaim(session.user.id, key) }
}

// Register an uploaded object as the brand picture. A new picture starts centred.
export async function saveBrandImage(key: string, claim: string): Promise<BrandImageResult> {
  if (!KEY_PATTERN.test(key)) return { ok: false, error: "Invalid image key" }
  const { buildPublicUrl, verifyUploadClaim } = await import("@/lib/s3")
  const session = await requireSeller()
  if (!verifyUploadClaim(session.user.id, key, claim)) {
    return { ok: false, error: "Invalid upload claim" }
  }
  const url = buildPublicUrl(key)

  const result = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const [store] = await tx
        .select({
          id: schema.stores.id,
          slug: schema.stores.slug,
          imageUrl: schema.stores.imageUrl,
        })
        .from(schema.stores)
        .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
        .limit(1)
        .for("update", { of: schema.stores })
      if (!store) return null
      await tx
        .update(schema.stores)
        .set({ imageUrl: url, imageFocalX: 50, imageFocalY: 50, updatedAt: new Date() })
        .where(eq(schema.stores.id, store.id))
      return store
    },
  )
  if (!result) return { ok: false, error: "Store not found or not authorized" }

  if (result.imageUrl !== url) deleteLater(result.imageUrl)
  revalidate(result.slug)
  return { ok: true, imageUrl: url, focalX: 50, focalY: 50 }
}

export async function removeBrandImage(): Promise<BrandImageResult> {
  const session = await requireSeller()
  const result = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const [store] = await tx
        .select({
          id: schema.stores.id,
          slug: schema.stores.slug,
          imageUrl: schema.stores.imageUrl,
        })
        .from(schema.stores)
        .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
        .limit(1)
        .for("update", { of: schema.stores })
      if (!store) return null
      await tx
        .update(schema.stores)
        .set({ imageUrl: null, imageFocalX: 50, imageFocalY: 50, updatedAt: new Date() })
        .where(eq(schema.stores.id, store.id))
      return store
    },
  )
  if (!result) return { ok: false, error: "Store not found or not authorized" }

  deleteLater(result.imageUrl)
  revalidate(result.slug)
  return { ok: true, imageUrl: null, focalX: 50, focalY: 50 }
}

export async function setBrandImageFocus(
  focalX: number,
  focalY: number,
): Promise<BrandImageResult> {
  const session = await requireSeller()
  if (!isFocalInput(focalX) || !isFocalInput(focalY)) {
    return { ok: false, error: "Invalid focus point" }
  }
  const x = clampFocal(focalX)
  const y = clampFocal(focalY)

  const result = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const [store] = await tx
        .select({
          id: schema.stores.id,
          slug: schema.stores.slug,
          imageUrl: schema.stores.imageUrl,
        })
        .from(schema.stores)
        .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
        .limit(1)
        .for("update", { of: schema.stores })
      if (!store?.imageUrl) return null
      await tx
        .update(schema.stores)
        .set({ imageFocalX: x, imageFocalY: y, updatedAt: new Date() })
        .where(eq(schema.stores.id, store.id))
      return store
    },
  )
  if (!result?.imageUrl) return { ok: false, error: "Upload a brand picture first" }

  revalidate(result.slug)
  return { ok: true, imageUrl: result.imageUrl, focalX: x, focalY: y }
}
