import { asc } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { Card } from "@/components/ui/card"
import { CategoryRow } from "./category-row"
import { NewCategoryForm } from "./new-category-form"

export default async function CategoriesPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin list categories" },
    async (tx) =>
      tx
        .select({
          id: schema.categories.id,
          name: schema.categories.name,
          slug: schema.categories.slug,
          sortOrder: schema.categories.sortOrder,
          isActive: schema.categories.isActive,
        })
        .from(schema.categories)
        .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name)),
  )

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Categories</h1>
        <NewCategoryForm />
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
              <CategoryRow key={cat.id} cat={cat} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
