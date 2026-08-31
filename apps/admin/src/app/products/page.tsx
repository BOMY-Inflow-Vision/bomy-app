import Link from "next/link"
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { id: adminId } = await requireAdmin()
  const { q } = await searchParams

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list products" },
    async (tx) => {
      const filters: SQL[] = []
      if (q && q.trim()) {
        const like = `%${q.trim()}%`
        const search = or(ilike(schema.products.name, like), ilike(schema.stores.name, like))
        if (search) filters.push(search)
      }
      return tx
        .select({
          id: schema.products.id,
          name: schema.products.name,
          status: schema.products.status,
          storeName: schema.stores.name,
          storeSlug: schema.stores.slug,
          ownerEmail: schema.users.email,
          ownerName: schema.users.name,
        })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .innerJoin(schema.users, eq(schema.users.id, schema.stores.ownerId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(asc(schema.stores.name), asc(schema.products.name))
    },
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Products</h1>
        <form method="get" className="flex items-center gap-1">
          <label htmlFor="products-search" className="sr-only">
            Search products
          </label>
          <Input
            id="products-search"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by product or store…"
            className="h-8 w-64 text-sm"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Seller</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/products/${row.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div>{row.storeName}</div>
                  <div className="font-mono text-xs">{row.storeSlug}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.ownerName ?? row.ownerEmail}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{row.status}</Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
