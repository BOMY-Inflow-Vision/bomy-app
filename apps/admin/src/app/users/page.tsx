import { sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { RoleSelector } from "./role-selector"

const ROLE_COLORS: Record<string, string> = {
  buyer: "bg-gray-100 text-gray-700",
  seller_owner: "bg-green-100 text-green-700",
  seller_staff: "bg-emerald-100 text-emerald-700",
  bomy_ops: "bg-blue-100 text-blue-700",
  bomy_admin: "bg-indigo-100 text-indigo-700",
  bomy_finance: "bg-purple-100 text-purple-700",
}

export default async function UsersPage() {
  const session = await auth()
  if (!session) return null

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
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Users</h1>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Change Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{row.name ?? "—"}</div>
                  <div className="text-xs text-gray-400">{row.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[row.role] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {row.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{row.createdAt.toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <RoleSelector userId={row.id} currentRole={row.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
