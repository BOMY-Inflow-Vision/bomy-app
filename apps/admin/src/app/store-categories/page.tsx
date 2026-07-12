import { asc } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { Card } from "@/components/ui/card"
import { StoreCategoryRow } from "./category-row"
import { NewStoreCategoryForm } from "./new-category-form"

export default async function StoreCategoriesPage() {
  const { id: adminId } = await requireAdmin()

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list store categories" },
    async (tx) =>
      tx
        .select({
          id: schema.storeCategories.id,
          name: schema.storeCategories.name,
          slug: schema.storeCategories.slug,
          sortOrder: schema.storeCategories.sortOrder,
          isActive: schema.storeCategories.isActive,
        })
        .from(schema.storeCategories)
        .orderBy(asc(schema.storeCategories.sortOrder), asc(schema.storeCategories.name)),
  )

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Store Categories</h1>
        <NewStoreCategoryForm />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Slug</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Order</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((cat) => (
              <StoreCategoryRow key={cat.id} cat={cat} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No store categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
