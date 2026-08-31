"use server"

import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { validateSeoFields } from "@bomy/shared/seo"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { validateStoreProvisioning } from "@/lib/brand-story-validation"

export async function approveStore(storeId: string) {
  const adminId = await requireAdminId()
  await withAdmin(getDb(), { userId: adminId, reason: "admin approve store" }, async (tx) => {
    const [store] = await tx
      .select({ ownerId: schema.stores.ownerId })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId))
      .limit(1)
    if (!store) throw new Error("Store not found")
    await tx
      .update(schema.stores)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(schema.stores.id, storeId))
    await tx
      .update(schema.users)
      .set({ role: "seller_owner", updatedAt: new Date() })
      .where(eq(schema.users.id, store.ownerId))
  })
  revalidatePath("/stores")
}

export async function suspendStore(storeId: string) {
  const adminId = await requireAdminId()
  await withAdmin(getDb(), { userId: adminId, reason: "admin suspend store" }, async (tx) => {
    await tx
      .update(schema.stores)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(schema.stores.id, storeId))
  })
  revalidatePath("/stores")
}

export async function createStore(formData: FormData) {
  const adminId = await requireAdminId()
  const ownerEmail = formData.get("ownerEmail") as string
  const name = formData.get("name") as string
  const slug = formData.get("slug") as string
  const description = (formData.get("description") as string) || null
  const bodyHtml = formData.get("bodyHtml")
  const videoUrl = formData.get("videoUrl")

  if (!ownerEmail || !name || !slug) throw new Error("Missing required fields")

  const storeId = randomUUID()
  const validated = await validateStoreProvisioning(bodyHtml, videoUrl, storeId)
  if (!validated.ok) throw new Error(validated.error)
  const { bodyHtml: finalBodyHtml, videoId } = validated

  await withAdmin(getDb(), { userId: adminId, reason: "admin create store" }, async (tx) => {
    const [owner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, ownerEmail))
      .for("update")
      .limit(1)
    if (!owner) throw new Error(`No user found with email: ${ownerEmail}`)

    const existingStore = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, owner.id))
      .limit(1)
    if (existingStore.length > 0) throw new Error("Owner already has a store")

    // id/bodyHtml/videoId supplied together in one INSERT — never insert first and update
    // after (same partial-commit hazard as approveInquiry).
    await tx.insert(schema.stores).values({
      id: storeId,
      ownerId: owner.id,
      name,
      slug,
      description,
      status: "active",
      bodyHtml: finalBodyHtml,
      videoId,
    })
    await tx
      .update(schema.users)
      .set({ role: "seller_owner", updatedAt: new Date() })
      .where(eq(schema.users.id, owner.id))
  })
  revalidatePath("/stores")
}

export async function updateStoreSeo(
  storeId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminId = await requireAdminId()

  const validated = validateSeoFields({
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
  })
  if (!validated.ok) {
    const firstError = Object.values(validated.errors)[0]
    return { ok: false, error: firstError ?? "Invalid input." }
  }
  const { metaTitle, metaDescription, ogImageUrl } = validated.value

  const result = await withAdmin(
    getDb(),
    { userId: adminId, reason: `admin update store SEO (storeId=${storeId})` },
    async (tx) => {
      const [row] = await tx
        .update(schema.stores)
        .set({ metaTitle, metaDescription, ogImageUrl, updatedAt: new Date() })
        .where(eq(schema.stores.id, storeId))
        .returning({ slug: schema.stores.slug })
      if (!row) return { ok: false as const, error: "Store not found" }
      return { ok: true as const, slug: row.slug }
    },
  )

  if (!result.ok) return result

  revalidatePath(`/stores/${storeId}`)
  revalidatePath(`/brands/${result.slug}`)

  return { ok: true }
}
