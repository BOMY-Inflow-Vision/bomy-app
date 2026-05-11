import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { cancelMembership, updateRenewalNotificationDays } from "./actions"

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  active: "text-green-600",
  cancelled: "text-slate-500",
  expired: "text-red-500",
  payment_failed: "text-red-700",
}

export default async function MembershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session) return null
  const { status } = await searchParams

  const [notifyDaysRow, rows] = await Promise.all([
    withAdmin(
      getDb(),
      { userId: session.user.id, reason: "admin read renewal_notification_days" },
      async (tx) =>
        tx
          .select({ value: schema.platformConfig.value })
          .from(schema.platformConfig)
          .where(eq(schema.platformConfig.key, "renewal_notification_days"))
          .limit(1),
    ).then((r) => r[0]),
    withAdmin(
      getDb(),
      { userId: session.user.id, reason: "admin list memberships" },
      async (tx) => {
        const q = tx
          .select({
            id: schema.memberSubscriptions.id,
            userEmail: schema.users.email,
            status: schema.memberSubscriptions.status,
            priceMyrSen: schema.memberSubscriptions.priceMyrSen,
            periodStart: schema.memberSubscriptions.periodStart,
            periodEnd: schema.memberSubscriptions.periodEnd,
            cancelledAt: schema.memberSubscriptions.cancelledAt,
            hitpayRecurringId: schema.memberSubscriptions.hitpayRecurringId,
          })
          .from(schema.memberSubscriptions)
          .innerJoin(schema.users, eq(schema.users.id, schema.memberSubscriptions.userId))
          .orderBy(desc(sql`${schema.memberSubscriptions.createdAt}`))

        if (
          status &&
          ["pending", "active", "cancelled", "expired", "payment_failed"].includes(status)
        ) {
          return q.where(
            eq(
              schema.memberSubscriptions.status,
              status as "pending" | "active" | "cancelled" | "expired" | "payment_failed",
            ),
          )
        }
        return q
      },
    ),
  ])

  const currentNotifyDays = Array.isArray(notifyDaysRow?.value)
    ? (notifyDaysRow.value as number[]).join(", ")
    : "30, 14, 7, 1"

  return (
    <div className="space-y-8 p-6">
      {/* Renewal notification settings */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Renewal Notification Settings</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <form action={updateRenewalNotificationDays} className="flex items-end gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notification days
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (comma-separated, descending e.g. 30, 14, 7, 1)
                </span>
              </label>
              <input
                name="notificationDays"
                type="text"
                defaultValue={currentNotifyDays}
                className="w-64 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save
            </button>
          </form>
        </div>
      </div>

      {/* Memberships roster */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Platform Memberships</h1>
          <div className="flex gap-1 text-sm">
            {["", "pending", "active", "cancelled", "expired", "payment_failed"].map((s) => (
              <Link
                key={s}
                href={s ? `/memberships?status=${s}` : "/memberships"}
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
        </div>
        <div className="rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Price (MYR)</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Recurring ID</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-700">{row.userEmail}</td>
                  <td
                    className={`px-4 py-3 font-medium ${STATUS_COLORS[row.status] ?? "text-gray-600"}`}
                  >
                    {row.status}
                    {row.cancelledAt && (
                      <span className="ml-1 text-xs text-gray-400">
                        (cancelled {row.cancelledAt.toLocaleDateString()})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(Number(row.priceMyrSen) / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {row.periodStart.toLocaleDateString()} – {row.periodEnd.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {row.hitpayRecurringId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "active" && !row.cancelledAt && (
                      <form action={cancelMembership.bind(null, row.id)}>
                        <button type="submit" className="text-red-600 hover:underline text-xs">
                          Cancel
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No memberships found.
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
