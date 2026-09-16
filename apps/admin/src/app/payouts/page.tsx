import { and, desc, eq, sql } from "drizzle-orm"
import { ArrowRight } from "lucide-react"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"
import { pageCount, pageOffset, parsePage, PAGE_SIZE } from "@/lib/pagination"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Pagination } from "@/components/ui/pagination"

import { PayoutActions } from "./_payout-actions"

const PAYOUT_STATUSES = ["pending", "processing", "completed", "failed"] as const
type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

interface Props {
  searchParams: Promise<{ status?: string; page?: string }>
}

export default async function PayoutsPage({ searchParams }: Props) {
  const { id: adminId } = await requireAdmin({ roles: ["bomy_admin", "bomy_finance"] })
  const { status, page: pageParam } = await searchParams
  const page = parsePage(pageParam)

  const validStatus = PAYOUT_STATUSES.includes(status as PayoutStatus)
    ? (status as PayoutStatus)
    : undefined

  const { rows: payouts, total } = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list payouts" },
    async (tx) => {
      const conditions = []
      if (validStatus) {
        conditions.push(eq(schema.orderPayouts.status, validStatus))
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = await tx
        .select({
          id: schema.orderPayouts.id,
          orderId: schema.orderPayouts.orderId,
          storeName: schema.stores.name,
          amountSen: schema.orderPayouts.amountSen,
          status: schema.orderPayouts.status,
          manualRef: schema.orderPayouts.manualRef,
          triggeredAt: schema.orderPayouts.triggeredAt,
          completedAt: schema.orderPayouts.completedAt,
        })
        .from(schema.orderPayouts)
        .innerJoin(schema.orders, eq(schema.orderPayouts.orderId, schema.orders.id))
        .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
        .where(where)
        .orderBy(desc(schema.orderPayouts.triggeredAt))
        .limit(PAGE_SIZE)
        .offset(pageOffset(page))
      const countRows = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.orderPayouts)
        .where(where)
      return { rows, total: Number(countRows[0]!.count) }
    },
  )

  const statuses = ["pending", "processing", "completed", "failed"]

  const buildHref = (next: { status?: string; page?: number }) => {
    const params = new URLSearchParams()
    const s = next.status ?? validStatus ?? ""
    // A status change (no explicit page) resets to page 1.
    const p = next.page ?? 1
    if (s) params.set("status", s)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `/payouts?${qs}` : "/payouts"
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
        <Button asChild variant="link" icon={<ArrowRight />}>
          <a href="/payouts/reconciliation">Reconciliation</a>
        </Button>
      </div>

      <div className="mb-6 flex gap-2">
        <a
          href={buildHref({ status: "" })}
          className={cn(
            "rounded-full px-3 py-1 text-sm",
            !validStatus ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          All
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={buildHref({ status: s })}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize",
              validStatus === s
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
          >
            {s}
          </a>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-foreground">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Order</th>
              <th className="px-4 py-3 text-left">Store</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Ref</th>
              <th className="px-4 py-3 text-left">Triggered</th>
              <th className="px-4 py-3 text-left">Completed</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payouts.map((p) => (
              <tr key={p.id} className="hover:bg-muted/50">
                <td className="px-4 py-3">
                  <a
                    href={`/orders/${p.orderId}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {p.orderId.slice(0, 8)}…
                  </a>
                </td>
                <td className="px-4 py-3">{p.storeName}</td>
                <td className="px-4 py-3 text-right">RM {senToMyr(p.amountSen)}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="capitalize">
                    {p.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">{p.manualRef ?? "—"}</td>
                <td className="px-4 py-3">{p.triggeredAt.toLocaleDateString("en-MY")}</td>
                <td className="px-4 py-3">{p.completedAt?.toLocaleDateString("en-MY") ?? "—"}</td>
                <td className="px-4 py-3">
                  <PayoutActions payoutId={p.id} status={p.status} />
                </td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No payouts.
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
