import Link from "next/link"
import { eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { approveStore, suspendStore } from "./actions"

const STATUS_COLORS = {
  pending: "text-amber-600",
  active: "text-green-600",
  suspended: "text-red-600",
}

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session) return null
  const { status } = await searchParams

  const rows = await withAdmin(
    db,
    { userId: session.user.id, reason: "admin list stores" },
    async (tx) => {
      const q = tx
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          slug: schema.stores.slug,
          status: schema.stores.status,
          ownerEmail: schema.users.email,
          ownerName: schema.users.name,
          createdAt: schema.stores.createdAt,
        })
        .from(schema.stores)
        .innerJoin(schema.users, eq(schema.users.id, schema.stores.ownerId))
        .orderBy(sql`${schema.stores.createdAt} desc`)

      if (status && ["pending", "active", "suspended"].includes(status)) {
        return q.where(eq(schema.stores.status, status as "pending" | "active" | "suspended"))
      }
      return q
    },
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Stores</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 text-sm">
            {["", "pending", "active", "suspended"].map((s) => (
              <Link
                key={s}
                href={s ? `/stores?status=${s}` : "/stores"}
                className={`rounded px-3 py-1 ${status === s || (!status && !s) ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {s || "All"}
              </Link>
            ))}
          </div>
          <Link
            href="/stores/new"
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Create Store
          </Link>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{row.name}</div>
                  <div className="font-mono text-xs text-gray-400">{row.slug}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{row.ownerName ?? row.ownerEmail}</td>
                <td className={`px-4 py-3 font-medium ${STATUS_COLORS[row.status]}`}>
                  {row.status}
                </td>
                <td className="px-4 py-3 text-gray-400">{row.createdAt.toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {row.status === "pending" && (
                    <form action={approveStore.bind(null, row.id)}>
                      <button type="submit" className="text-indigo-600 hover:underline">
                        Approve
                      </button>
                    </form>
                  )}
                  {row.status === "active" && (
                    <form action={suspendStore.bind(null, row.id)}>
                      <button type="submit" className="text-red-600 hover:underline">
                        Suspend
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No stores found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
