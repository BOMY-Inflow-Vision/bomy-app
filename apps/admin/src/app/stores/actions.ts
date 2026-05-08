"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

async function getAdminId() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  return session.user.id
}

export async function approveStore(storeId: string) {
  const adminId = await getAdminId()
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
  const adminId = await getAdminId()
  await withAdmin(getDb(), { userId: adminId, reason: "admin suspend store" }, async (tx) => {
    await tx
      .update(schema.stores)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(schema.stores.id, storeId))
  })
  revalidatePath("/stores")
}

export async function createStore(formData: FormData) {
  const adminId = await getAdminId()
  const ownerEmail = formData.get("ownerEmail") as string
  const name = formData.get("name") as string
  const slug = formData.get("slug") as string
  const description = (formData.get("description") as string) || null

  if (!ownerEmail || !name || !slug) throw new Error("Missing required fields")

  await withAdmin(getDb(), { userId: adminId, reason: "admin create store" }, async (tx) => {
    const [owner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, ownerEmail))
      .limit(1)
    if (!owner) throw new Error(`No user found with email: ${ownerEmail}`)

    await tx.insert(schema.stores).values({
      ownerId: owner.id,
      name,
      slug,
      description,
      status: "active",
    })
    await tx
      .update(schema.users)
      .set({ role: "seller_owner", updatedAt: new Date() })
      .where(eq(schema.users.id, owner.id))
  })
  revalidatePath("/stores")
}
