import { and, desc, eq } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

import { PayoutActions } from "./_payout-actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

const PAYOUT_STATUSES = ["pending", "processing", "completed", "failed"] as const
type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function PayoutsPage({ searchParams }: Props) {
  const { status } = await searchParams

  const validStatus = PAYOUT_STATUSES.includes(status as PayoutStatus)
    ? (status as PayoutStatus)
    : undefined

  const payouts = await withAdmin(
    getDb(),
    { userId: SYSTEM_ACTOR, reason: "admin list payouts" },
    async (tx) => {
      const conditions = []
      if (validStatus) {
        conditions.push(eq(schema.orderPayouts.status, validStatus))
      }

      return tx
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
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.orderPayouts.triggeredAt))
    },
  )

  const statuses = ["pending", "processing", "completed", "failed"]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
        <a href="/payouts/reconciliation" className="text-sm text-primary hover:underline">
          Reconciliation →
        </a>
      </div>

      <div className="mb-6 flex gap-2">
        <a
          href="/payouts"
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
            href={`/payouts?status=${s}`}
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
      </Card>
    </div>
  )
}
