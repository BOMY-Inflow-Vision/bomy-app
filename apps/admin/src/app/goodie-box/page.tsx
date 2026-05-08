import Link from "next/link"
import { and, desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { markDispatched } from "./actions"

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  dispatched: "text-green-600",
  delivered: "text-blue-600",
}

export default async function GoodieBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; status?: string }>
}) {
  const session = await auth()
  if (!session) return null
  const { quarter, status } = await searchParams

  const quarters = await withAdmin(
    db,
    { userId: session.user.id, reason: "admin list goodie box quarters" },
    async (tx) =>
      tx
        .selectDistinct({ quarter: schema.goodieBoxDispatches.quarter })
        .from(schema.goodieBoxDispatches)
        .orderBy(desc(sql`${schema.goodieBoxDispatches.quarter}`)),
  )

  const rows = await withAdmin(
    db,
    { userId: session.user.id, reason: "admin list goodie box dispatches" },
    async (tx) => {
      const q = tx
        .select({
          id: schema.goodieBoxDispatches.id,
          userEmail: schema.users.email,
          quarter: schema.goodieBoxDispatches.quarter,
          status: schema.goodieBoxDispatches.status,
          shippingName: schema.goodieBoxDispatches.shippingName,
          trackingNumber: schema.goodieBoxDispatches.trackingNumber,
          dispatchedAt: schema.goodieBoxDispatches.dispatchedAt,
          notes: schema.goodieBoxDispatches.notes,
        })
        .from(schema.goodieBoxDispatches)
        .innerJoin(schema.users, eq(schema.users.id, schema.goodieBoxDispatches.userId))
        .orderBy(
          desc(sql`${schema.goodieBoxDispatches.quarter}`),
          schema.goodieBoxDispatches.shippingName,
        )

      const conditions = []
      if (quarter) conditions.push(eq(schema.goodieBoxDispatches.quarter, quarter))
      if (status && ["pending", "dispatched"].includes(status)) {
        conditions.push(eq(schema.goodieBoxDispatches.status, status as "pending" | "dispatched"))
      }

      if (conditions.length === 1) return q.where(conditions[0])
      if (conditions.length === 2) return q.where(and(conditions[0], conditions[1]))
      return q
    },
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900">Goodie Box Dispatches</h1>
        <div className="flex gap-1 text-sm">
          {["", "pending", "dispatched"].map((s) => (
            <Link
              key={s}
              href={`/goodie-box?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(quarter ? { quarter } : {}) }).toString()}`}
              className={`rounded px-3 py-1 ${
                status === s || (!status && !s)
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {s || "All"}
            </Link>
          ))}
        </div>
        {quarters.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-gray-500">Quarter:</span>
            <Link
              href={`/goodie-box?${new URLSearchParams({ ...(status ? { status } : {}) }).toString()}`}
              className={`rounded px-2 py-1 ${!quarter ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}
            >
              All
            </Link>
            {quarters.map((q) => (
              <Link
                key={q.quarter}
                href={`/goodie-box?${new URLSearchParams({ quarter: q.quarter, ...(status ? { status } : {}) }).toString()}`}
                className={`rounded px-2 py-1 ${quarter === q.quarter ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {q.quarter}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Quarter</th>
              <th className="px-4 py-3">Shipping Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Dispatched</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-700">{row.userEmail}</td>
                <td className="px-4 py-3 text-gray-600">{row.quarter}</td>
                <td className="px-4 py-3 text-gray-600">{row.shippingName}</td>
                <td
                  className={`px-4 py-3 font-medium ${STATUS_COLORS[row.status] ?? "text-gray-600"}`}
                >
                  {row.status}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {row.trackingNumber ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {row.dispatchedAt?.toLocaleDateString() ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {row.status === "pending" && (
                    <form
                      action={markDispatched.bind(null, row.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="trackingNumber"
                        placeholder="Tracking no."
                        required
                        className="w-32 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button type="submit" className="text-xs text-indigo-600 hover:underline">
                        Mark Dispatched
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No dispatches found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
