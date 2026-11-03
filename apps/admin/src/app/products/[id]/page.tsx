import { notFound } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { schema, withAdmin } from "@bomy/db"
import { Badge } from "@bomy/ui/badge"
import { Card } from "@bomy/ui/card"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { RatingRowActions } from "./_ratings-panel"
import { ProductSeoForm } from "./product-seo-form"

const remover = alias(schema.users, "remover")

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: adminId, role } = await requireAdmin()
  const { id } = await params
  // The rating actions allow ops and admin only; finance sees the list without controls.
  const canEditRatings = role === "bomy_ops" || role === "bomy_admin"

  const data = await withAdmin(
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
      if (!row) return null

      const ratings = await tx
        .select({
          id: schema.productRatings.id,
          stars: schema.productRatings.stars,
          createdAt: schema.productRatings.createdAt,
          updatedAt: schema.productRatings.updatedAt,
          removedAt: schema.productRatings.removedAt,
          removalReason: schema.productRatings.removalReason,
          buyerName: schema.users.name,
          buyerEmail: schema.users.email,
          removedByEmail: remover.email,
        })
        .from(schema.productRatings)
        .innerJoin(schema.users, eq(schema.users.id, schema.productRatings.userId))
        .leftJoin(remover, eq(remover.id, schema.productRatings.removedBy))
        .where(eq(schema.productRatings.productId, id))
        .orderBy(desc(schema.productRatings.createdAt))
      return { product: row, ratings }
    },
  )

  if (!data) notFound()
  const { product, ratings } = data

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

      <section aria-labelledby="ratings-heading" className="mt-6">
        <h2 id="ratings-heading" className="mb-3 text-sm font-semibold text-foreground">
          Ratings ({ratings.length})
        </h2>
        {ratings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ratings yet.</p>
        ) : (
          <Card className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Stars</th>
                  <th className="px-4 py-3">Rated at</th>
                  <th className="px-4 py-3">Status</th>
                  {canEditRatings && <th className="px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {ratings.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.buyerName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.buyerEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      <span aria-label={`${r.stars} of 5 stars`}>{r.stars} ★</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{r.createdAt.toLocaleString("en-MY")}</div>
                      {r.updatedAt.getTime() !== r.createdAt.getTime() && (
                        <div className="text-xs">changed {r.updatedAt.toLocaleString("en-MY")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.removedAt ? (
                        <div className="space-y-1">
                          <Badge variant="destructive-subtle">removed</Badge>
                          <div className="text-xs text-muted-foreground">
                            {r.removedAt.toLocaleString("en-MY")}
                            {r.removedByEmail ? ` by ${r.removedByEmail}` : ""}
                          </div>
                          <div className="max-w-xs text-xs break-words text-foreground">
                            {r.removalReason}
                          </div>
                        </div>
                      ) : (
                        <Badge variant="success">active</Badge>
                      )}
                    </td>
                    {canEditRatings && (
                      <td className="px-4 py-3">
                        {r.removedAt ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <RatingRowActions ratingId={r.id} currentStars={r.stars} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  )
}
