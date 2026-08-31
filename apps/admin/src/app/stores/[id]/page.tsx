import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { StoreSeoForm } from "./store-seo-form"

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdminId()
  const { id } = await params

  const store = await withAdmin(
    getDb(),
    { userId: adminId, reason: `admin view store detail (storeId=${id})` },
    async (tx) => {
      const [row] = await tx
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          slug: schema.stores.slug,
          status: schema.stores.status,
          ownerEmail: schema.users.email,
          metaTitle: schema.stores.metaTitle,
          metaDescription: schema.stores.metaDescription,
          ogImageUrl: schema.stores.ogImageUrl,
        })
        .from(schema.stores)
        .innerJoin(schema.users, eq(schema.users.id, schema.stores.ownerId))
        .where(eq(schema.stores.id, id))
        .limit(1)
      return row ?? null
    },
  )

  if (!store) notFound()

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold text-foreground">{store.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {store.slug} · {store.ownerEmail} · {store.status}
      </p>
      <StoreSeoForm
        storeId={store.id}
        currentMetaTitle={store.metaTitle ?? ""}
        currentMetaDescription={store.metaDescription ?? ""}
        currentOgImageUrl={store.ogImageUrl ?? ""}
      />
    </div>
  )
}
