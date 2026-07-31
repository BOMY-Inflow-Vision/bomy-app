"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withTenant } from "@bomy/db"
import { extractYoutubeVideoId } from "@bomy/shared/youtube"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

const EXCERPT_MAX = 160

export async function updateStoreSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session || session.user.role !== "seller_owner") {
    return { ok: false, error: "Unauthorized" }
  }

  const rawExcerpt = formData.get("excerpt")
  if (typeof rawExcerpt !== "string") {
    return { ok: false, error: "Invalid input." }
  }
  const excerpt = rawExcerpt.trim()

  if (excerpt.length > EXCERPT_MAX) {
    return { ok: false, error: `Excerpt must be ${EXCERPT_MAX} characters or fewer.` }
  }

  let updateError: string | null = null

  try {
    await withTenant(
      getDb(),
      { userId: session.user.id, userRole: session.user.role },
      async (tx) => {
        const [store] = await tx
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(
            and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")),
          )
          .limit(1)

        if (!store) {
          updateError = "No active store found."
          return
        }

        const updated = await tx
          .update(schema.stores)
          .set({ excerpt: excerpt || null, updatedAt: new Date() })
          .where(
            and(
              eq(schema.stores.id, store.id),
              eq(schema.stores.ownerId, session.user.id),
              eq(schema.stores.status, "active"),
            ),
          )
          .returning({ id: schema.stores.id })

        if (updated.length === 0) {
          updateError = "Update failed."
        }
      },
    )
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." }
  }

  if (updateError) return { ok: false, error: updateError }
  return { ok: true }
}

export async function updateStoreCategories(
  categoryIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session || session.user.role !== "seller_owner") {
    return { ok: false, error: "Unauthorized" }
  }

  const uniqueIds = [...new Set(categoryIds)]

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uniqueIds.some((id) => !uuidRe.test(id))) {
    return { ok: false, error: "Invalid category selection." }
  }

  let updateError: string | null = null

  try {
    await withTenant(
      getDb(),
      { userId: session.user.id, userRole: session.user.role },
      async (tx) => {
        const [store] = await tx
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(
            and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")),
          )
          .limit(1)

        if (!store) {
          updateError = "No active store found."
          return
        }

        if (uniqueIds.length > 0) {
          const validCats = await tx
            .select({ id: schema.storeCategories.id })
            .from(schema.storeCategories)
            .where(
              and(
                inArray(schema.storeCategories.id, uniqueIds),
                eq(schema.storeCategories.isActive, true),
              ),
            )
          if (validCats.length !== uniqueIds.length) {
            updateError = "One or more selected categories are unavailable."
            return
          }
        }

        // Replace all assignments atomically
        await tx
          .delete(schema.storeCategoryAssignments)
          .where(eq(schema.storeCategoryAssignments.storeId, store.id))

        if (uniqueIds.length > 0) {
          await tx.insert(schema.storeCategoryAssignments).values(
            uniqueIds.map((storeCategoryId) => ({
              storeId: store.id,
              storeCategoryId,
            })),
          )
        }
      },
    )
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." }
  }

  if (updateError) return { ok: false, error: updateError }
  return { ok: true }
}

export async function updateStoreVideo(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session || session.user.role !== "seller_owner") {
    return { ok: false, error: "Unauthorized" }
  }

  const rawUrl = formData.get("videoUrl")
  if (typeof rawUrl !== "string") {
    return { ok: false, error: "Invalid input." }
  }
  const trimmed = rawUrl.trim()

  let videoId: string | null = null
  if (trimmed.length > 0) {
    videoId = extractYoutubeVideoId(trimmed)
    if (!videoId) {
      return { ok: false, error: "Could not find a valid YouTube video in that URL." }
    }
  }

  let result: { ok: true; storeSlug: string } | { ok: false; error: string }

  try {
    result = await withTenant(
      getDb(),
      { userId: session.user.id, userRole: session.user.role },
      async (tx) => {
        const [store] = await tx
          .select({ id: schema.stores.id, slug: schema.stores.slug })
          .from(schema.stores)
          .where(
            and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")),
          )
          .limit(1)

        if (!store) {
          return { ok: false as const, error: "No active store found." }
        }

        const updated = await tx
          .update(schema.stores)
          .set({ videoId, updatedAt: new Date() })
          .where(
            and(
              eq(schema.stores.id, store.id),
              eq(schema.stores.ownerId, session.user.id),
              eq(schema.stores.status, "active"),
            ),
          )
          .returning({ id: schema.stores.id })

        if (updated.length === 0) {
          return { ok: false as const, error: "Update failed." }
        }

        return { ok: true as const, storeSlug: store.slug }
      },
    )
  } catch {
    return { ok: false, error: "Failed to save video URL." }
  }

  if (!result.ok) return result

  revalidatePath("/seller/dashboard/settings")
  revalidatePath(`/brands/${result.storeSlug}`)

  return { ok: true }
}
