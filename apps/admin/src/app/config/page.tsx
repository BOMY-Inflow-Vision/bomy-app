import { sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export default async function ConfigPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(
    db,
    { userId: session.user.id, reason: "admin view config" },
    async (tx) =>
      tx
        .select({
          key: schema.platformConfig.key,
          value: schema.platformConfig.value,
          description: schema.platformConfig.description,
          updatedAt: schema.platformConfig.updatedAt,
        })
        .from(schema.platformConfig)
        .orderBy(sql`${schema.platformConfig.key} asc`),
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-lg font-semibold text-gray-900">Platform Config</h1>
        <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
          Read-only
        </span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.key}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-900">
                  {JSON.stringify(row.value)}
                </td>
                <td className="px-4 py-3 text-gray-500">{row.description ?? "—"}</td>
                <td className="px-4 py-3 text-gray-400">{row.updatedAt.toLocaleDateString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No config entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
