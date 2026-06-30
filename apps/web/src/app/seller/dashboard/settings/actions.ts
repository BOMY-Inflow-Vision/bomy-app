"use server"

import { eq } from "drizzle-orm"

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

  const excerpt = (formData.get("excerpt") as string | null)?.trim() ?? ""

  if (excerpt.length > EXCERPT_MAX) {
    return { ok: false, error: `Excerpt must be ${EXCERPT_MAX} characters or fewer.` }
  }

  await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      await tx
        .update(schema.stores)
        .set({ excerpt: excerpt || null, updatedAt: new Date() })
        .where(eq(schema.stores.ownerId, session.user.id))
    },
  )

  return { ok: true }
}
