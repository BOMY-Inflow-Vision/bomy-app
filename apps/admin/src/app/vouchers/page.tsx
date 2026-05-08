import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export default async function VouchersPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(
    db,
    { userId: session.user.id, reason: "admin list vouchers" },
    async (tx) =>
      tx
        .select({
          id: schema.vouchers.id,
          userEmail: schema.users.email,
          code: schema.vouchers.code,
          type: schema.vouchers.type,
          fixedAmountSen: schema.vouchers.fixedAmountSen,
          percentage: schema.vouchers.percentage,
          randomResolvedSen: schema.vouchers.randomResolvedSen,
          issuedMonth: schema.vouchers.issuedMonth,
          expiresAt: schema.vouchers.expiresAt,
          redeemedAt: schema.vouchers.redeemedAt,
        })
        .from(schema.vouchers)
        .innerJoin(schema.users, eq(schema.users.id, schema.vouchers.userId))
        .orderBy(desc(sql`${schema.vouchers.createdAt}`)),
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Vouchers</h1>
        <Link
          href="/vouchers/new"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Create Voucher
        </Link>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Redeemed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              let value = "—"
              if (row.type === "fixed_myr" && row.fixedAmountSen != null) {
                value = `RM${(Number(row.fixedAmountSen) / 100).toFixed(2)}`
              } else if (row.type === "percentage" && row.percentage != null) {
                value = `${row.percentage}%`
              } else if (row.type === "random_myr" && row.randomResolvedSen != null) {
                value = `RM${(Number(row.randomResolvedSen) / 100).toFixed(2)}`
              }

              return (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-700">{row.userEmail}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{row.code}</td>
                  <td className="px-4 py-3 text-gray-600">{row.type}</td>
                  <td className="px-4 py-3 font-medium text-gray-700">{value}</td>
                  <td className="px-4 py-3 text-gray-400">{row.issuedMonth}</td>
                  <td className="px-4 py-3 text-gray-400">{row.expiresAt.toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {row.redeemedAt ? row.redeemedAt.toLocaleDateString() : "—"}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No vouchers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
