import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { triggerVoucherIssuance, updateVoucherConfig } from "./actions"

export default async function VouchersPage() {
  const session = await auth()
  if (!session) return null

  const [configRows, statsRows, vouchers] = await Promise.all([
    withAdmin(
      getDb(),
      { userId: session.user.id, reason: "admin read voucher config" },
      async (tx) =>
        tx
          .select({ key: schema.platformConfig.key, value: schema.platformConfig.value })
          .from(schema.platformConfig)
          .where(sql`${schema.platformConfig.key} like 'voucher_monthly_%'`),
    ),
    withAdmin(
      getDb(),
      { userId: session.user.id, reason: "admin voucher redemption stats" },
      async (tx) =>
        tx
          .select({
            issuedMonth: schema.vouchers.issuedMonth,
            total: sql<number>`count(*)`,
            redeemed: sql<number>`count(${schema.vouchers.redeemedAt})`,
          })
          .from(schema.vouchers)
          .groupBy(schema.vouchers.issuedMonth)
          .orderBy(desc(schema.vouchers.issuedMonth)),
    ),
    withAdmin(getDb(), { userId: session.user.id, reason: "admin list vouchers" }, async (tx) =>
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
    ),
  ])

  const config = Object.fromEntries(configRows.map((r) => [r.key, r.value]))
  const currentType = (config["voucher_monthly_type"] as string) ?? "fixed_myr"

  return (
    <div className="space-y-8 p-6">
      {/* Monthly voucher config */}
      <div>
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Monthly Voucher Config</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <form id="voucher-config-form" action={updateVoucherConfig} className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="w-32 text-sm font-medium text-gray-700">Type</label>
              <select
                name="type"
                defaultValue={currentType}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="fixed_myr">Fixed MYR</option>
                <option value="percentage">Percentage</option>
                <option value="random_myr">Random MYR</option>
              </select>
            </div>
            {/* All three field groups are always rendered so the form is
                submittable after changing the type dropdown without JS.
                The action only validates fields for the submitted type. */}
            <div className="flex items-center gap-4">
              <label className="w-32 text-sm font-medium text-gray-700">
                Amount (MYR)
                <span className="ml-1 text-xs font-normal text-gray-400">(fixed)</span>
              </label>
              <input
                name="fixedAmountMyr"
                type="text"
                defaultValue={
                  config["voucher_monthly_fixed_sen"] != null
                    ? (Number(config["voucher_monthly_fixed_sen"]) / 100).toFixed(2)
                    : ""
                }
                placeholder="e.g. 10.00"
                className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="w-32 text-sm font-medium text-gray-700">
                Percentage
                <span className="ml-1 text-xs font-normal text-gray-400">(pct)</span>
              </label>
              <input
                name="percentage"
                type="number"
                min="1"
                max="100"
                defaultValue={
                  typeof config["voucher_monthly_pct"] === "number"
                    ? String(config["voucher_monthly_pct"])
                    : ""
                }
                placeholder="e.g. 20"
                className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="w-32 text-sm font-medium text-gray-700">
                Range (MYR)
                <span className="ml-1 text-xs font-normal text-gray-400">(random)</span>
              </label>
              <input
                name="randomMinMyr"
                type="text"
                defaultValue={
                  config["voucher_monthly_random_min_sen"] != null
                    ? (Number(config["voucher_monthly_random_min_sen"]) / 100).toFixed(2)
                    : ""
                }
                placeholder="Min"
                className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-gray-400">–</span>
              <input
                name="randomMaxMyr"
                type="text"
                defaultValue={
                  config["voucher_monthly_random_max_sen"] != null
                    ? (Number(config["voucher_monthly_random_max_sen"]) / 100).toFixed(2)
                    : ""
                }
                placeholder="Max"
                className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </form>
          {/* Buttons are siblings — never nest forms. Save Config references
              voucher-config-form via the form= attribute (HTML5 association). */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              form="voucher-config-form"
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save Config
            </button>
            <form action={triggerVoucherIssuance}>
              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Issue Now
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Redemption stats */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-800">Redemption Rate by Month</h2>
        <div className="rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Redeemed</th>
                <th className="px-4 py-3">Rate</th>
              </tr>
            </thead>
            <tbody>
              {statsRows.map((row) => {
                const rate = row.total > 0 ? Math.round((row.redeemed / row.total) * 100) : 0
                return (
                  <tr key={row.issuedMonth} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.issuedMonth}</td>
                    <td className="px-4 py-3 text-gray-600">{row.total}</td>
                    <td className="px-4 py-3 text-gray-600">{row.redeemed}</td>
                    <td className="px-4 py-3 text-gray-600">{rate}%</td>
                  </tr>
                )
              })}
              {statsRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No vouchers issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compensation vouchers */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Compensation Vouchers</h2>
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
              {vouchers.map((row) => {
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
                    <td className="px-4 py-3 text-gray-400">
                      {row.expiresAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {row.redeemedAt ? row.redeemedAt.toLocaleDateString() : "—"}
                    </td>
                  </tr>
                )
              })}
              {vouchers.length === 0 && (
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
    </div>
  )
}
