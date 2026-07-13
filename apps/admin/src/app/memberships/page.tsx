import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  const { id: adminId } = await requireAdmin()
  const { status } = await searchParams

  const [notifyDaysRow, rows] = await Promise.all([
    withAdmin(
      getDb(),
      { userId: adminId, reason: "admin read renewal_notification_days" },
      async (tx) =>
        tx
          .select({ value: schema.platformConfig.value })
          .from(schema.platformConfig)
          .where(eq(schema.platformConfig.key, "renewal_notification_days"))
          .limit(1),
    ).then((r) => r[0]),
    withAdmin(getDb(), { userId: adminId, reason: "admin list memberships" }, async (tx) => {
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
    }),
  ])

  const currentNotifyDays = Array.isArray(notifyDaysRow?.value)
    ? (notifyDaysRow.value as number[]).join(", ")
    : "30, 14, 7, 1"

  return (
    <div className="space-y-8 p-6">
      {/* Renewal notification settings */}
      <section aria-labelledby="renewal-settings-heading">
        <h2 id="renewal-settings-heading" className="mb-4 text-lg font-semibold text-foreground">
          Renewal Notification Settings
        </h2>
        <Card className="p-6">
          <form action={updateRenewalNotificationDays} className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="notificationDays" className="mb-1 block">
                Notification days
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  (comma-separated, descending e.g. 30, 14, 7, 1)
                </span>
              </Label>
              <Input
                id="notificationDays"
                name="notificationDays"
                type="text"
                defaultValue={currentNotifyDays}
                className="w-64"
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </Card>
      </section>

      {/* Memberships roster */}
      <section aria-labelledby="memberships-heading">
        <div className="mb-4 flex items-center justify-between">
          <h1 id="memberships-heading" className="text-lg font-semibold text-foreground">
            Platform Memberships
          </h1>
          <div className="flex gap-1 text-sm">
            {["", "pending", "active", "cancelled", "expired", "payment_failed"].map((s) => (
              <Link
                key={s}
                href={s ? `/memberships?status=${s}` : "/memberships"}
                className={cn(
                  "rounded px-3 py-1",
                  status === s || (!status && !s)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s || "All"}
              </Link>
            ))}
          </div>
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
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
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-foreground">{row.userEmail}</td>
                  <td
                    className={cn(
                      "px-4 py-3 font-medium",
                      STATUS_COLORS[row.status] ?? "text-muted-foreground",
                    )}
                  >
                    {row.status}
                    {row.cancelledAt && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (cancelled {row.cancelledAt.toLocaleDateString()})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(Number(row.priceMyrSen) / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.periodStart.toLocaleDateString()} – {row.periodEnd.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.hitpayRecurringId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "active" && !row.cancelledAt && (
                      <form action={cancelMembership.bind(null, row.id)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-xs text-destructive hover:text-destructive"
                        >
                          Cancel
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No memberships found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
