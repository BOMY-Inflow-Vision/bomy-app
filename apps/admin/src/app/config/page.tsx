import { sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"

export default async function ConfigPage() {
  const { id: adminId } = await requireAdmin()

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin view config" },
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
        <h1 className="text-lg font-semibold text-foreground">Platform Config</h1>
        <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
          Read-only
        </span>
      </div>
      <div className="rounded-lg border border-border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-foreground">{row.key}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  {JSON.stringify(row.value)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.description ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.updatedAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
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
