"use server"

import { randomUUID } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

import { auth } from "@/auth"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

async function requireSeller() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")
  return session
}

const BODY_IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]
const BODY_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

export async function saveStoreBody(
  bodyHtml: string,
  revision: number,
): Promise<{ ok: true; revision: number; html: string | null } | { ok: false; error: string }> {
  const session = await requireSeller()
  const userId = session.user.id

  if (!Number.isSafeInteger(revision) || revision < 0) {
    return { ok: false, error: "invalid_revision" }
  }

  const S3_PUBLIC_URL = process.env["S3_PUBLIC_URL"] ?? ""
  try {
    const u = new URL(S3_PUBLIC_URL)
    if (u.protocol !== "https:") throw new Error()
  } catch {
    return { ok: false, error: "misconfigured" }
  }

  const txResult = await withTenant(getDb(), { userId, userRole: "seller_owner" }, async (tx) => {
    const [store] = await tx
      .select({
        id: schema.stores.id,
        slug: schema.stores.slug,
        bodyRevision: schema.stores.bodyRevision,
        bodyHtml: schema.stores.bodyHtml,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.ownerId, userId), eq(schema.stores.status, "active")))
      .for("update", { of: schema.stores })
      .limit(1)
    if (!store) return { ok: false as const, error: "not_found" }
    if (store.bodyRevision !== revision) return { ok: false as const, error: "conflict" }

    const { normalizeBodyHtml } = await import("@bomy/shared/body-sanitizer")
    const normalized = normalizeBodyHtml(bodyHtml, { kind: "store", id: store.id }, S3_PUBLIC_URL)
    if (!normalized.ok) return normalized
    const { canonicalHtml } = normalized

    await tx
      .update(schema.stores)
      .set({ bodyHtml: canonicalHtml, bodyRevision: revision + 1, updatedAt: new Date() })
      .where(eq(schema.stores.id, store.id))

    return {
      ok: true as const,
      storeId: store.id,
      storeSlug: store.slug,
      canonicalHtml,
      oldBodyHtml: store.bodyHtml,
    }
  })

  if (!txResult.ok) return txResult

  const { storeId, storeSlug, canonicalHtml, oldBodyHtml } = txResult

  revalidatePath("/seller/dashboard/settings")
  revalidatePath(`/brands/${storeSlug}`)

  if (oldBodyHtml) {
    after(async () => {
      try {
        const { extractManagedBodyImageKeys } = await import("@bomy/shared")
        const { deleteObject } = await import("@/lib/s3")
        const scope = { kind: "store" as const, id: storeId }
        const oldKeys = extractManagedBodyImageKeys(oldBodyHtml, scope, S3_PUBLIC_URL)
        const newKeys = extractManagedBodyImageKeys(canonicalHtml ?? "", scope, S3_PUBLIC_URL)
        const [current] = await withAdmin(
          getDb(),
          { userId: SYSTEM_ACTOR, reason: "body-image-orphan-cleanup" },
          (tx) =>
            tx
              .select({ bodyHtml: schema.stores.bodyHtml })
              .from(schema.stores)
              .where(eq(schema.stores.id, storeId)),
        )
        const currentKeys = extractManagedBodyImageKeys(
          current?.bodyHtml ?? "",
          scope,
          S3_PUBLIC_URL,
        )
        for (const key of oldKeys) {
          if (!newKeys.has(key) && !currentKeys.has(key)) {
            try {
              await deleteObject(key)
            } catch (err) {
              console.error(`[saveStoreBody] R2 delete failed for key ${key}:`, err)
            }
          }
        }
      } catch (err) {
        console.error("[saveStoreBody] Orphan image cleanup failed:", err)
      }
    })
  }

  return { ok: true, revision: revision + 1, html: canonicalHtml }
}

export async function getStoreBodyImageUploadUrl(
  contentType: string,
  contentLength: number,
): Promise<
  | { ok: true; uploadUrl: string; key: string; publicUrl: string; expiresAt: Date }
  | { ok: false; error: string }
> {
  const session = await requireSeller()
  const userId = session.user.id

  if (!BODY_IMAGE_ALLOWED_TYPES.includes(contentType)) {
    return { ok: false, error: "invalid_type" }
  }
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > 2 * 1024 * 1024
  ) {
    return { ok: false, error: "invalid_size" }
  }

  const result = await withTenant(getDb(), { userId, userRole: "seller_owner" }, async (tx) => {
    const [store] = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.ownerId, userId), eq(schema.stores.status, "active")))
      .for("update", { of: schema.stores })
      .limit(1)
    if (!store) return { ok: false as const, error: "not_found" }

    // Same lock key as the product upload flow (products/actions.ts) — deliberately not
    // scoped separately, so a seller's product-upload-signing and store-upload-signing
    // serialize against each other rather than racing independently.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('body-img-sign:' || ${userId}))`)

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bodyImageUploadLog)
      .where(
        and(
          eq(schema.bodyImageUploadLog.userId, userId),
          sql`${schema.bodyImageUploadLog.createdAt} > now() - interval '1 hour'`,
        ),
      )
    const count = countRows[0]?.count ?? 0
    if (count >= 20) return { ok: false as const, error: "rate_limited" }

    await tx.insert(schema.bodyImageUploadLog).values({ userId })
    return { ok: true as const, storeId: store.id }
  })

  if (!result.ok) return result

  const ext = BODY_MIME_TO_EXT[contentType]!
  const key = `body/stores/${result.storeId}/${randomUUID()}.${ext}`
  const { createBodyPresignedPutUrl, buildPublicUrl } = await import("@/lib/s3")
  const publicUrl = buildPublicUrl(key)
  const { url: uploadUrl, expiresAt } = await createBodyPresignedPutUrl(
    key,
    contentType,
    contentLength,
  )
  return { ok: true, uploadUrl, key, publicUrl, expiresAt }
}
