"use server"

import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { extractYoutubeVideoId } from "@bomy/shared/youtube"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { BRAND_STORY_MIN_CHARS, extractPlainText } from "@/lib/brand-story-validation"

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
  const bodyHtml = formData.get("bodyHtml") as string
  const videoUrl = formData.get("videoUrl") as string

  if (!ownerEmail || !name || !slug) throw new Error("Missing required fields")

  // Pure validation before any DB write — withAdmin only rolls back on throw, so every check
  // that can reject this request must run before the INSERT, never after (see approveInquiry
  // for the same pattern and its full rationale).
  const videoId = extractYoutubeVideoId((videoUrl ?? "").trim())
  if (!videoId) throw new Error("A valid YouTube video URL is required.")

  const S3_PUBLIC_URL = process.env["S3_PUBLIC_URL"] ?? ""
  try {
    const u = new URL(S3_PUBLIC_URL)
    if (u.protocol !== "https:") throw new Error()
  } catch {
    throw new Error("Server misconfigured: S3_PUBLIC_URL.")
  }

  const storeId = randomUUID()
  const { normalizeBodyHtml } = await import("@bomy/shared/body-sanitizer")
  const sanitized = normalizeBodyHtml(bodyHtml ?? "", { kind: "store", id: storeId }, S3_PUBLIC_URL)
  if (!sanitized.ok) throw new Error(`Brand Story: ${sanitized.error}`)
  if (sanitized.canonicalHtml === null) throw new Error("Brand Story is required.")
  if (extractPlainText(sanitized.canonicalHtml).length < BRAND_STORY_MIN_CHARS) {
    throw new Error(
      `Brand Story needs at least ${BRAND_STORY_MIN_CHARS} characters of actual text.`,
    )
  }
  const finalBodyHtml = sanitized.canonicalHtml

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
