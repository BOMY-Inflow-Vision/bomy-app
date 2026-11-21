import { sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"
import { Badge } from "@bomy/ui/badge"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { PageFrame } from "@/components/admin-ui/page-frame"
import { PageHeader } from "@/components/admin-ui/page-header"
import { Tile } from "@/components/admin-ui/tile"

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
    <PageFrame>
      <PageHeader title="Platform Config">
        <Badge variant="warning">Read-only</Badge>
      </PageHeader>
      <Tile className="overflow-x-auto">
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
      </Tile>
    </PageFrame>
  )
}
