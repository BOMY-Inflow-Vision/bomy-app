import { sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { CopyId } from "./copy-id"
import { RoleSelector } from "./role-selector"
import { UserEditor } from "./user-editor"

const ROLE_COLORS: Record<string, string> = {
  buyer: "bg-muted text-foreground",
  seller_owner: "bg-green-100 text-green-700",
  seller_staff: "bg-emerald-100 text-emerald-700",
  bomy_ops: "bg-blue-100 text-blue-700",
  bomy_admin: "bg-accent text-accent-foreground",
  bomy_finance: "bg-purple-100 text-purple-700",
}

export default async function UsersPage() {
  const session = await auth()
  if (!session) return null

  const canEdit = session.user.role === "bomy_admin"

  const rows = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin list users" },
    async (tx) =>
      tx
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .orderBy(sql`${schema.users.createdAt} desc`),
  )

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-foreground">Users</h1>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Change Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  {canEdit ? (
                    <UserEditor userId={row.id} name={row.name} email={row.email} />
                  ) : (
                    <>
                      <div className="font-medium text-foreground">{row.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </>
                  )}
                  <CopyId id={row.id} />
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      ROLE_COLORS[row.role] ?? "bg-muted text-foreground",
                      "border-transparent",
                    )}
                  >
                    {row.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <RoleSelector userId={row.id} currentRole={row.role} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
