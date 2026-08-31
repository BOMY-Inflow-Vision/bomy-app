import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { ProductSeoForm } from "./product-seo-form"

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdminId()
  const { id } = await params

  const product = await withAdmin(
    getDb(),
    { userId: adminId, reason: `admin view product detail (productId=${id})` },
    async (tx) => {
      const [row] = await tx
        .select({
          id: schema.products.id,
          name: schema.products.name,
          status: schema.products.status,
          storeName: schema.stores.name,
          storeSlug: schema.stores.slug,
          ownerEmail: schema.users.email,
          ownerName: schema.users.name,
          metaTitle: schema.products.metaTitle,
          metaDescription: schema.products.metaDescription,
          ogImageUrl: schema.products.ogImageUrl,
        })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .innerJoin(schema.users, eq(schema.users.id, schema.stores.ownerId))
        .where(eq(schema.products.id, id))
        .limit(1)
      return row ?? null
    },
  )

  if (!product) notFound()

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold text-foreground">{product.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {product.storeName} ({product.storeSlug}) · {product.ownerName ?? product.ownerEmail} ·{" "}
        {product.status}
      </p>
      <ProductSeoForm
        productId={product.id}
        currentMetaTitle={product.metaTitle ?? ""}
        currentMetaDescription={product.metaDescription ?? ""}
        currentOgImageUrl={product.ogImageUrl ?? ""}
      />
    </div>
  )
}
