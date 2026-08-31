"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { validateSeoFields } from "@bomy/shared/seo"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"

export async function updateProductSeo(
  productId: string,
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
    { userId: adminId, reason: `admin update product SEO (productId=${productId})` },
    async (tx) => {
      const [row] = await tx
        .select({ productSlug: schema.products.slug, storeSlug: schema.stores.slug })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(eq(schema.products.id, productId))
        .limit(1)
      if (!row) return { ok: false as const, error: "Product not found" }

      await tx
        .update(schema.products)
        .set({ metaTitle, metaDescription, ogImageUrl, updatedAt: new Date() })
        .where(eq(schema.products.id, productId))

      return { ok: true as const, storeSlug: row.storeSlug, productSlug: row.productSlug }
    },
  )

  if (!result.ok) return result

  // Only invalidates apps/admin's own Next.js cache — this is a separate deployment from
  // apps/web, so the /products/${storeSlug}/${productSlug} call cannot invalidate apps/web's
  // cache. Currently a no-op in production either way, since apps/web/src/app/layout.tsx sets
  // `dynamic = "force-dynamic"` (no route cache to invalidate). Kept for defensiveness in case
  // that ever changes.
  revalidatePath(`/products/${productId}`)
  revalidatePath(`/products/${result.storeSlug}/${result.productSlug}`)

  return { ok: true }
}
