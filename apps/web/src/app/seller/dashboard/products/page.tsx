import Link from "next/link"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getSellerProducts } from "./actions"

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  archived: "bg-slate-100 text-slate-500",
}

export default async function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const { status } = await searchParams
  const products = await getSellerProducts(status)

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Products</h1>
        <Link
          href="/seller/dashboard/products/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New Product
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-2">
        {["", "draft", "active", "archived"].map((s) => (
          <Link
            key={s}
            href={s ? `/seller/dashboard/products?status=${s}` : "/seller/dashboard/products"}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === s || (!status && !s)
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s ? STATUS_LABELS[s] : "All"}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">No products yet.</p>
          <Link
            href="/seller/dashboard/products/new"
            className="mt-3 inline-block text-sm text-indigo-600 hover:underline"
          >
            Create your first product →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left">Product</th>
                <th className="px-5 py-3 text-left">Slug</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Created</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-3">
                      {p.coverImageUrl ? (
                        <img
                          src={p.coverImageUrl}
                          alt=""
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-gray-100" />
                      )}
                      {p.name}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{p.slug}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}
                    >
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {p.createdAt.toLocaleDateString("en-MY")}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/seller/dashboard/products/${p.id}/edit`}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
