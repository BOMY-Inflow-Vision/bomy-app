import Link from "next/link"
import { redirect } from "next/navigation"
import { Pencil, Plus } from "lucide-react"

import { auth } from "@/auth"
import { Badge } from "@bomy/ui/badge"
import { Button } from "@bomy/ui/button"
import { FilterTab, FilterTabs } from "@bomy/ui/filter-tabs"
import { productStatusVariant } from "@/lib/status-badge"
import { getSellerProducts } from "./actions"

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
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

  if (products === null) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-xl font-semibold text-foreground">Products</h1>
        <div className="rounded-xl border border-border bg-background p-12 text-center shadow-sm">
          <p className="font-medium text-foreground">Your store is not active.</p>
          <p className="mt-2 text-muted-foreground">
            You cannot manage products while your store is suspended or waiting for approval.
          </p>
          <Button variant="link" size="sm" className="mt-3" asChild>
            <Link href="/contact">Contact us</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Products</h1>
        <Button asChild icon={<Plus />}>
          <Link href="/seller/dashboard/products/new">New Product</Link>
        </Button>
      </div>

      {/* Status filter tabs */}
      <FilterTabs label="Filter by status" className="mb-4 gap-2">
        {["", "draft", "active", "archived"].map((s) => (
          <FilterTab key={s} asChild variant="primary" active={status === s || (!status && !s)}>
            <Link
              href={s ? `/seller/dashboard/products?status=${s}` : "/seller/dashboard/products"}
            >
              {s ? STATUS_LABELS[s] : "All"}
            </Link>
          </FilterTab>
        ))}
      </FilterTabs>

      {products.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center shadow-sm">
          <p className="text-muted-foreground">No products yet.</p>
          <Button variant="link" size="sm" icon={<Plus />} className="mt-3" asChild>
            <Link href="/seller/dashboard/products/new">Create your first product</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
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
                          width={32}
                          height={32}
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
                    <Badge variant={productStatusVariant(p.status)}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {p.createdAt.toLocaleDateString("en-MY")}
                  </td>
                  <td className="px-5 py-3">
                    <Button variant="link" size="sm" icon={<Pencil />} className="text-xs" asChild>
                      <Link href={`/seller/dashboard/products/${p.id}/edit`}>Edit</Link>
                    </Button>
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
