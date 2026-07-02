import Link from "next/link"
import { and, desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  active: "text-green-600",
  cancelled: "text-slate-500",
  expired: "text-red-500",
  payment_failed: "text-red-700",
}

export default async function BrandSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; storeId?: string }>
}) {
  const session = await auth()
  if (!session) return null
  const { status, storeId } = await searchParams

  const rows = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin list brand subscriptions" },
    async (tx) => {
      const conditions = []
      if (
        status &&
        ["pending", "active", "cancelled", "expired", "payment_failed"].includes(status)
      ) {
        conditions.push(
          eq(
            schema.brandSubscriptions.status,
            status as "pending" | "active" | "cancelled" | "expired" | "payment_failed",
          ),
        )
      }
      if (storeId) {
        conditions.push(eq(schema.brandSubscriptions.storeId, storeId))
      }

      return tx
        .select({
          id: schema.brandSubscriptions.id,
          buyerEmail: schema.users.email,
          storeName: schema.stores.name,
          storeId: schema.stores.id,
          termMonths: schema.brandSubscriptionPlans.termMonths,
          priceMyrSen: schema.brandSubscriptions.priceMyrSen,
          discountPct: schema.brandSubscriptions.discountPct,
          status: schema.brandSubscriptions.status,
          periodEnd: schema.brandSubscriptions.periodEnd,
          hitpayPaymentRequestId: schema.brandSubscriptions.hitpayPaymentRequestId,
        })
        .from(schema.brandSubscriptions)
        .innerJoin(schema.users, eq(schema.users.id, schema.brandSubscriptions.userId))
        .innerJoin(schema.stores, eq(schema.stores.id, schema.brandSubscriptions.storeId))
        .innerJoin(
          schema.brandSubscriptionPlans,
          eq(schema.brandSubscriptionPlans.id, schema.brandSubscriptions.planId),
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(sql`${schema.brandSubscriptions.createdAt}`))
    },
  )

  const stores = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin list stores for brand sub filter" },
    async (tx) =>
      tx
        .selectDistinct({ id: schema.stores.id, name: schema.stores.name })
        .from(schema.stores)
        .innerJoin(
          schema.brandSubscriptions,
          eq(schema.brandSubscriptions.storeId, schema.stores.id),
        )
        .orderBy(schema.stores.name),
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground">Brand Subscriptions</h1>
        <div className="flex gap-1 text-sm">
          {["", "pending", "active", "cancelled", "expired", "payment_failed"].map((s) => (
            <Link
              key={s}
              href={`/brand-subscriptions?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(storeId ? { storeId } : {}) }).toString()}`}
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
        {stores.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Store:</span>
            <Link
              href={`/brand-subscriptions?${new URLSearchParams({ ...(status ? { status } : {}) }).toString()}`}
              className={cn(
                "rounded px-2 py-1",
                !storeId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              All
            </Link>
            {stores.map((s) => (
              <Link
                key={s.id}
                href={`/brand-subscriptions?${new URLSearchParams({ storeId: s.id, ...(status ? { status } : {}) }).toString()}`}
                className={cn(
                  "rounded px-2 py-1",
                  storeId === s.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Price (MYR)</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period End</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-foreground">{row.buyerEmail}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.storeName}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.termMonths}mo</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(Number(row.priceMyrSen) / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.discountPct}%</td>
                <td
                  className={cn(
                    "px-4 py-3 font-medium",
                    STATUS_COLORS[row.status] ?? "text-muted-foreground",
                  )}
                >
                  {row.status}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.periodEnd.toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No brand subscriptions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
