"use server"

import { and, eq } from "drizzle-orm"

import { schema, withTenant } from "@bomy/db"

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

        // Replace all assignments atomically
        await tx
          .delete(schema.storeCategoryAssignments)
          .where(eq(schema.storeCategoryAssignments.storeId, store.id))

        if (categoryIds.length > 0) {
          await tx.insert(schema.storeCategoryAssignments).values(
            categoryIds.map((storeCategoryId) => ({
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
