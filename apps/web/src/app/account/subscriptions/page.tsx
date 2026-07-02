import { desc, eq } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getDb } from "@/lib/db"
import { AccountTabs } from "../account-tabs"

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
}

function senToMyr(sen: bigint): string {
  return `RM${Number(sen) / 100}`
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
  payment_failed: "Payment failed",
}

export default async function AccountSubscriptionsPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/account/subscriptions")

  // Fetch all brand subscriptions for this user, joined with store info.
  const subs = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({
          id: schema.brandSubscriptions.id,
          status: schema.brandSubscriptions.status,
          priceMyrSen: schema.brandSubscriptions.priceMyrSen,
          discountPct: schema.brandSubscriptions.discountPct,
          periodEnd: schema.brandSubscriptions.periodEnd,
          periodStart: schema.brandSubscriptions.periodStart,
          storeName: schema.stores.name,
          storeSlug: schema.stores.slug,
          termMonths: schema.brandSubscriptionPlans.termMonths,
        })
        .from(schema.brandSubscriptions)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.brandSubscriptions.storeId))
        .innerJoin(
          schema.brandSubscriptionPlans,
          eq(schema.brandSubscriptionPlans.id, schema.brandSubscriptions.planId),
        )
        .where(eq(schema.brandSubscriptions.userId, session.user.id))
        .orderBy(desc(schema.brandSubscriptions.createdAt)),
  )

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
      <h1 className="sr-only">Brand Subscriptions</h1>
      <Card className="w-full max-w-2xl shadow-sm">
        <CardContent className="p-8">
          <AccountTabs active="subscriptions" />

          <h2 className="text-lg font-semibold text-foreground mb-4">Brand subscriptions</h2>

          {subs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">No brand subscriptions yet.</p>
              <p className="text-xs text-muted-foreground">
                Visit a brand{"'"}s store page to subscribe and unlock exclusive discounts.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {subs.map((sub) => {
                const termLabel =
                  sub.termMonths === 12 ? "12-month" : sub.termMonths === 6 ? "6-month" : "3-month"
                const statusLabel = STATUS_LABEL[sub.status] ?? sub.status
                const isExpiredOrCancelled = sub.status === "expired" || sub.status === "cancelled"

                return (
                  <li key={sub.id} className="flex items-start justify-between py-4 gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            sub.status === "active"
                              ? "default"
                              : sub.status === "pending"
                                ? "secondary"
                                : isExpiredOrCancelled
                                  ? "outline"
                                  : "destructive"
                          }
                          className={
                            sub.status === "active"
                              ? "bg-green-100 text-green-700 border-transparent hover:bg-green-100"
                              : sub.status === "pending"
                                ? "bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100"
                                : undefined
                          }
                        >
                          {statusLabel}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground truncate">
                          {sub.storeName}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {termLabel} · {senToMyr(sub.priceMyrSen)} · {sub.discountPct}% off orders
                      </p>
                      {(sub.status === "active" || sub.status === "pending") && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ends {formatDate(sub.periodEnd)}
                        </p>
                      )}
                      {isExpiredOrCancelled ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ended {formatDate(sub.periodEnd)}
                        </p>
                      ) : null}
                    </div>
                    {isExpiredOrCancelled ? (
                      <Button asChild variant="outline" size="sm" className="shrink-0">
                        <Link href={`/brands/${sub.storeSlug}/subscribe`}>Renew</Link>
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
