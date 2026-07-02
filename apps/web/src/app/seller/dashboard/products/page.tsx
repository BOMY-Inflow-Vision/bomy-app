import Link from "next/link"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSellerProducts } from "./actions"

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
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
        <h1 className="text-xl font-semibold text-foreground">Products</h1>
        <Button asChild>
          <Link href="/seller/dashboard/products/new">New Product</Link>
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-2">
        {["", "draft", "active", "archived"].map((s) => (
          <Link
            key={s}
            href={s ? `/seller/dashboard/products?status=${s}` : "/seller/dashboard/products"}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              status === s || (!status && !s)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {s ? STATUS_LABELS[s] : "All"}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center shadow-sm">
          <p className="text-muted-foreground">No products yet.</p>
          <Link
            href="/seller/dashboard/products/new"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Create your first product →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted text-xs font-medium uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left">Product</th>
                <th className="px-5 py-3 text-left">Slug</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Created</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-muted">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      {p.coverImageUrl ? (
                        <img
                          src={p.coverImageUrl}
                          alt=""
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted" />
                      )}
                      {p.name}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{p.slug}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}
                    >
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {p.createdAt.toLocaleDateString("en-MY")}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/seller/dashboard/products/${p.id}/edit`}
                      className="text-xs text-primary hover:underline"
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
