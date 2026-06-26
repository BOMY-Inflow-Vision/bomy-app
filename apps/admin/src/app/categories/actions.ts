"use server"

import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

async function getAdminId() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  return session.user.id
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function createCategory(
  formData: FormData,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const adminId = await getAdminId()
  const name = (formData.get("name") as string | null)?.trim() ?? ""
  if (!name) return { ok: false, error: "Name is required" }

  const slug = slugify(name)
  if (!slug) return { ok: false, error: "Could not generate a valid slug" }

  try {
    await withAdmin(getDb(), { userId: adminId, reason: "admin create category" }, async (tx) => {
      const [maxRow] = await tx
        .select({ max: schema.categories.sortOrder })
        .from(schema.categories)
        .orderBy(desc(schema.categories.sortOrder))
        .limit(1)

      const sortOrder = (maxRow?.max ?? 0) + 10
      await tx.insert(schema.categories).values({ name, slug, sortOrder, isActive: true })
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("unique") || msg.includes("duplicate"))
      return { ok: false, error: "A category with that slug already exists" }
    throw e
  }

  revalidatePath("/categories")
  return { ok: true }
}

export async function toggleCategory(id: string, isActive: boolean): Promise<void> {
  const adminId = await getAdminId()
  await withAdmin(getDb(), { userId: adminId, reason: "admin toggle category" }, async (tx) => {
    await tx.update(schema.categories).set({ isActive }).where(eq(schema.categories.id, id))
  })
  revalidatePath("/categories")
}
