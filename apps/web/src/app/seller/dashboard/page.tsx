import Link from "next/link"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

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
        <p className="text-gray-500">No store found. Contact BOMY support.</p>
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
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{store.name}</h1>
            <p className="mt-0.5 font-mono text-sm text-gray-400">/{store.slug}</p>
            {store.description && <p className="mt-2 text-sm text-gray-600">{store.description}</p>}
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
          className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm hover:bg-gray-50"
        >
          <div className="text-3xl font-bold text-indigo-600">→</div>
          <div className="mt-1 text-sm font-medium text-gray-700">Products</div>
          <div className="mt-1 text-xs text-gray-400">Manage your listings</div>
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="text-3xl font-bold text-slate-300">—</div>
          <div className="mt-1 text-sm text-gray-500">Orders</div>
          <div className="mt-1 text-xs text-indigo-400">Coming soon</div>
        </div>
      </div>
    </div>
  )
}
