import { asc } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { StoreCategoryRow } from "./category-row"
import { NewStoreCategoryForm } from "./new-category-form"

export default async function StoreCategoriesPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin list store categories" },
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
        <h1 className="text-xl font-semibold text-gray-900">Store Categories</h1>
        <NewStoreCategoryForm />
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
              <StoreCategoryRow key={cat.id} cat={cat} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No store categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
