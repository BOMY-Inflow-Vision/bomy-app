import { asc, eq, inArray } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

import { fetchNegativeCommissionOrders } from "../../orders/_queries"
import { RefundButton } from "./_refund-button"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

export default async function ReconciliationPage() {
  const session = await auth()
  const canRefund = ["bomy_admin", "bomy_finance"].includes(
    (session?.user as { role?: string } | undefined)?.role ?? "",
  )

  const [negativeOrders, reviewSessions, duplicateCharges] = await Promise.all([
    fetchNegativeCommissionOrders(getDb()),
    withAdmin(
      getDb(),
      { userId: SYSTEM_ACTOR, reason: "admin list payment review sessions" },
      async (tx) =>
        tx
          .select({
            id: schema.checkoutSessions.id,
            status: schema.checkoutSessions.status,
            paymentReviewReason: schema.checkoutSessions.paymentReviewReason,
            createdAt: schema.checkoutSessions.createdAt,
          })
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.status, "payment_review_required"))
          .orderBy(asc(schema.checkoutSessions.createdAt)),
    ),
    withAdmin(
      getDb(),
      { userId: SYSTEM_ACTOR, reason: "admin list duplicate charges" },
      async (tx) =>
        tx
          .select()
          .from(schema.duplicateCharges)
          .where(inArray(schema.duplicateCharges.status, ["detected", "refund_pending"]))
          .orderBy(asc(schema.duplicateCharges.detectedAt)),
    ),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reconciliation</h1>
        <a href="/payouts" className="text-sm text-primary hover:underline">
          ← Back to payouts
        </a>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Negative commission orders ({negativeOrders.length})
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Completed orders where BOMY commission is negative. All shown regardless of payout status.
        </p>
        {negativeOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm text-foreground">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-right">Seller payout</th>
                  <th className="px-4 py-3 text-left">Payout status</th>
                  <th className="px-4 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {negativeOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <a
                        href={`/orders/${o.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {o.id.slice(0, 8)}…
                      </a>
                    </td>
                    <td className="px-4 py-3">{o.storeName}</td>
                    <td className="px-4 py-3 text-right text-destructive">
                      −RM {senToMyr(-o.bomyCommissionSen)}
                    </td>
                    <td className="px-4 py-3 text-right">RM {senToMyr(o.sellerPayoutSen)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">
                        {o.payoutStatus ?? "none"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{o.createdAt.toLocaleDateString("en-MY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Payment review queue ({reviewSessions.length})
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Checkout sessions awaiting admin resolution. Oldest first.
        </p>
        {reviewSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Queue clear.</p>
        ) : (
          <ul className="space-y-3">
            {reviewSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-yellow-200 bg-yellow-50 px-6 py-4"
              >
                <div>
                  <p className="font-mono text-sm text-foreground">{s.id.slice(0, 8)}…</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reason: <code>{s.paymentReviewReason}</code> ·{" "}
                    {s.createdAt.toLocaleDateString("en-MY")}
                  </p>
                </div>
                <a
                  href={`/checkout-sessions/${s.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Review →
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Duplicate charges ({duplicateCharges.length})
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Payments received for an entitlement we will not honour. Refunding clears the
          liability:duplicate_charge_payable account.
        </p>
        {duplicateCharges.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm text-foreground">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Payment ID</th>
                  <th className="px-4 py-3 text-left">Detected</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {duplicateCharges.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs">{d.userId}</td>
                    <td className="px-4 py-3">
                      {d.subscriptionType === "member_subscription" ? "Membership" : "Brand"}
                    </td>
                    <td className="px-4 py-3 text-right">RM{senToMyr(d.amountSen)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.hitpayPaymentId}</td>
                    <td className="px-4 py-3">{d.detectedAt.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{d.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {d.status === "detected" && canRefund ? (
                        <RefundButton id={d.id} />
                      ) : d.status === "refund_pending" ? (
                        <span className="text-xs text-muted-foreground">Refund pending</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  )
}
