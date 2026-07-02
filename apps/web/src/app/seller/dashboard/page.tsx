import Link from "next/link"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { CopyStoreId } from "./copy-store-id"

export default async function SellerDashboardPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const store = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          slug: schema.stores.slug,
          status: schema.stores.status,
          description: schema.stores.description,
          createdAt: schema.stores.createdAt,
        })
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, session.user.id))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!store) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">No store found. Contact BOMY support.</p>
      </div>
    )
  }

  const STATUS_COLORS = {
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    suspended: "bg-red-100 text-red-700",
  }

  return (
    <div className="p-8">
      <div className="mb-6 rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{store.name}</h1>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">/{store.slug}</p>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Store ID:</span>
              <CopyStoreId id={store.id} />
            </div>
            {store.description && (
              <p className="mt-2 text-sm text-muted-foreground">{store.description}</p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[store.status]}`}
          >
            {store.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/seller/dashboard/products"
          className="rounded-xl border border-border bg-background p-6 text-center shadow-sm hover:bg-muted"
        >
          <div className="text-3xl font-bold text-primary">→</div>
          <div className="mt-1 text-sm font-medium text-foreground">Products</div>
          <div className="mt-1 text-xs text-muted-foreground">Manage your listings</div>
        </Link>
        <div className="rounded-xl border border-border bg-background p-6 text-center shadow-sm">
          <div className="text-3xl font-bold text-slate-300">—</div>
          <div className="mt-1 text-sm text-muted-foreground">Orders</div>
          <div className="mt-1 text-xs text-primary/70">Coming soon</div>
        </div>
      </div>
    </div>
  )
}
