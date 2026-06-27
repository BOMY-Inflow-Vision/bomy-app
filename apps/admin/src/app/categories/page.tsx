import { asc } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
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
        <h1 className="text-xl font-semibold text-gray-900">Categories</h1>
        <NewCategoryForm />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 font-medium text-gray-600">Slug</th>
              <th className="px-4 py-3 font-medium text-gray-600">Order</th>
              <th className="px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
