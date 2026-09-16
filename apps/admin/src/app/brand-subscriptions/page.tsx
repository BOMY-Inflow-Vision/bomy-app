import Link from "next/link"
import { and, desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { pageCount, pageOffset, parsePage, PAGE_SIZE } from "@/lib/pagination"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Pagination } from "@/components/ui/pagination"

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
  searchParams: Promise<{ status?: string; storeId?: string; page?: string }>
}) {
  const { id: adminId } = await requireAdmin()
  const { status, storeId, page: pageParam } = await searchParams
  const page = parsePage(pageParam)

  const { rows, total } = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list brand subscriptions" },
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
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = await tx
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
        .where(where)
        .orderBy(desc(sql`${schema.brandSubscriptions.createdAt}`))
        .limit(PAGE_SIZE)
        .offset(pageOffset(page))
      const countRows = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.brandSubscriptions)
        .where(where)
      return { rows, total: Number(countRows[0]!.count) }
    },
  )

  const stores = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list stores for brand sub filter" },
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

  const buildHref = (next: { status?: string; storeId?: string; page?: number }) => {
    const s = next.status ?? status ?? ""
    const sid = next.storeId ?? storeId ?? ""
    // Any filter change (no explicit page) resets to page 1 — staying on the current
    // page could land past the end of a narrower result set.
    const p = next.page ?? 1
    const params = new URLSearchParams()
    if (s) params.set("status", s)
    if (sid) params.set("storeId", sid)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `/brand-subscriptions?${qs}` : "/brand-subscriptions"
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground">Brand Subscriptions</h1>
        <div className="flex gap-1 text-sm">
          {["", "pending", "active", "cancelled", "expired", "payment_failed"].map((s) => (
            <Link
              key={s}
              href={buildHref({ status: s })}
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
              href={buildHref({ storeId: "" })}
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
                href={buildHref({ storeId: s.id })}
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
        <Pagination
          page={page}
          totalPages={pageCount(total)}
          buildHref={(p) => buildHref({ page: p })}
        />
      </Card>
    </div>
  )
}
