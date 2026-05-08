import { eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { togglePlanActive } from "./actions"

export default async function BrandPlansPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(
    db,
    { userId: session.user.id, reason: "admin list brand subscription plans" },
    async (tx) =>
      tx
        .select({
          id: schema.brandSubscriptionPlans.id,
          storeName: schema.stores.name,
          storeSlug: schema.stores.slug,
          termMonths: schema.brandSubscriptionPlans.termMonths,
          priceMyrSen: schema.brandSubscriptionPlans.priceMyrSen,
          discountPct: schema.brandSubscriptionPlans.discountPct,
          description: schema.brandSubscriptionPlans.description,
          isActive: schema.brandSubscriptionPlans.isActive,
          createdAt: schema.brandSubscriptionPlans.createdAt,
        })
        .from(schema.brandSubscriptionPlans)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.brandSubscriptionPlans.storeId))
        .orderBy(schema.stores.name, sql`${schema.brandSubscriptionPlans.termMonths} asc`),
  )

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Brand Subscription Plans</h1>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Price (MYR)</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Toggle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{row.storeName}</div>
                  <div className="font-mono text-xs text-gray-400">{row.storeSlug}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{row.termMonths}mo</td>
                <td className="px-4 py-3 text-gray-600">
                  {(Number(row.priceMyrSen) / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-gray-600">{row.discountPct}%</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{row.description ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`font-medium ${row.isActive ? "text-green-600" : "text-gray-400"}`}
                  >
                    {row.isActive ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <form action={togglePlanActive.bind(null, row.id, !row.isActive)}>
                    <button
                      type="submit"
                      className={`text-xs hover:underline ${row.isActive ? "text-red-600" : "text-indigo-600"}`}
                    >
                      {row.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No brand subscription plans found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
