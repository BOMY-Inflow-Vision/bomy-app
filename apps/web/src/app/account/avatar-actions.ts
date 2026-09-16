"use server"

import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { checkActionRateLimit, makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { ACTION_RATE_LIMITS, RATE_LIMIT_USER_MESSAGE } from "@/lib/rate-limits"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export async function getAvatarUploadUrl(
  contentType: string,
  contentLength: number,
): Promise<{ ok: true; uploadUrl: string; key: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const limit = await checkActionRateLimit(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    "profile_edit",
    ACTION_RATE_LIMITS.profileEdit,
  )
  if (!limit.allowed) return { ok: false, error: RATE_LIMIT_USER_MESSAGE }

  const ext = ALLOWED_IMAGE_TYPES[contentType]
  if (!ext) return { ok: false, error: "Only JPEG, PNG, WebP, GIF, or AVIF images are allowed" }
  if (contentLength <= 0 || contentLength > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Image must be smaller than 2 MB" }
  }

  // A fresh UUID per upload (rather than a fixed per-user key) avoids serving a browser-cached
  // copy of the old avatar from the same URL right after a re-upload; the old object is deleted
  // in updateAvatarImage once the new one is confirmed saved.
  const key = `avatars/${randomUUID()}.${ext}`
  const { createBodyPresignedPutUrl } = await import("@/lib/s3")
  const { url } = await createBodyPresignedPutUrl(key, contentType, contentLength)
  return { ok: true, uploadUrl: url, key }
}

export async function updateAvatarImage(
  key: string,
): Promise<{ ok: true; image: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  const userId = session.user.id

  if (!/^avatars\/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/.test(key)) {
    return { ok: false, error: "Invalid image key" }
  }

  const { buildPublicUrl, keyFromPublicUrl, deleteObject } = await import("@/lib/s3")
  const image = buildPublicUrl(key)

  const [previous] = await withTenant(
    getDb(),
    { userId, userRole: session.user.role },
    async (tx) => {
      const [row] = await tx
        .select({ image: schema.users.image })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      // Only `image` is ever written here — never role/email — so a user can't
      // self-escalate through the users_self_update RLS policy.
      await tx
        .update(schema.users)
        .set({ image, updatedAt: new Date() })
        .where(eq(schema.users.id, userId))
      return [row?.image ?? null]
    },
  )

  const previousKey = previous ? keyFromPublicUrl(previous) : null
  if (previousKey && previousKey !== key) {
    await deleteObject(previousKey).catch(() => {
      // Best-effort cleanup — an orphaned old avatar object is harmless.
    })
  }

  revalidatePath("/account")
  return { ok: true, image }
}
