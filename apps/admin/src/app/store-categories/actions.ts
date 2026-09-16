"use server"

import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function createStoreCategory(
  formData: FormData,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) return { ok: false, error: authz.error }
  const adminId = authz.adminId
  const name = (formData.get("name") as string | null)?.trim() ?? ""
  if (!name) return { ok: false, error: "Name is required" }

  const slug = slugify(name)
  if (!slug) return { ok: false, error: "Could not generate a valid slug" }

  try {
    await withAdmin(
      getDb(),
      { userId: adminId, reason: "admin create store category" },
      async (tx) => {
        const [maxRow] = await tx
          .select({ max: schema.storeCategories.sortOrder })
          .from(schema.storeCategories)
          .orderBy(desc(schema.storeCategories.sortOrder))
          .limit(1)

        const sortOrder = (maxRow?.max ?? 0) + 10
        await tx.insert(schema.storeCategories).values({ name, slug, sortOrder, isActive: true })
      },
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("unique") || msg.includes("duplicate"))
      return { ok: false, error: "A store category with that slug already exists" }
    throw e
  }

  revalidatePath("/store-categories")
  return { ok: true }
}

export async function toggleStoreCategory(
  id: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) return { ok: false, error: authz.error }

  try {
    await withAdmin(
      getDb(),
      { userId: authz.adminId, reason: "admin toggle store category" },
      async (tx) => {
        await tx
          .update(schema.storeCategories)
          .set({ isActive })
          .where(eq(schema.storeCategories.id, id))
      },
    )
  } catch {
    return { ok: false, error: "Could not update category." }
  }
  revalidatePath("/store-categories")
  return { ok: true }
}

export async function updateStoreCategory(
  id: string,
  name: string,
  sortOrder: number,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) return { ok: false, error: authz.error }
  const adminId = authz.adminId
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: "Name is required" }
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 2_147_483_647)
    return { ok: false, error: "Sort order must be a whole number between 0 and 2,147,483,647" }

  await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin update store category" },
    async (tx) => {
      await tx
        .update(schema.storeCategories)
        .set({ name: trimmed, sortOrder })
        .where(eq(schema.storeCategories.id, id))
    },
  )
  revalidatePath("/store-categories")
  return { ok: true }
}

export async function deleteStoreCategory(
  id: string,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) return { ok: false, error: authz.error }
  const adminId = authz.adminId

  try {
    await withAdmin(
      getDb(),
      { userId: adminId, reason: "admin delete store category" },
      async (tx) => {
        const [inUse] = await tx
          .select({ storeId: schema.storeCategoryAssignments.storeId })
          .from(schema.storeCategoryAssignments)
          .where(eq(schema.storeCategoryAssignments.storeCategoryId, id))
          .limit(1)

        if (inUse) throw new Error("IN_USE")

        await tx.delete(schema.storeCategories).where(eq(schema.storeCategories.id, id))
      },
    )
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "IN_USE")
      return {
        ok: false,
        error: "Cannot delete: stores are assigned to this category. Deactivate it instead.",
      }
    throw e
  }

  revalidatePath("/store-categories")
  return { ok: true }
}
