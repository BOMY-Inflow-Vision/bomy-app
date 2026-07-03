import { and, eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cancelMembership } from "../actions"

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })
}

export default async function MembershipManagePage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership/manage")

  const sub = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select()
        .from(schema.memberSubscriptions)
        .where(
          and(
            eq(schema.memberSubscriptions.userId, session.user.id),
            eq(schema.memberSubscriptions.status, "active"),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!sub) redirect("/membership")

  const priceMyr = `RM${Number(sub.priceMyrSen) / 100}`
  const isCancelling = sub.cancelledAt !== null

  return (
    <main className="flex min-h-screen flex-col items-center bg-muted px-4 pt-20">
      <Card className="w-full max-w-lg rounded-2xl">
        <CardContent className="p-10">
          <div className="mb-6 flex items-center gap-3">
            {isCancelling ? (
              <Badge className="bg-amber-100 text-amber-700 border-transparent">
                Cancellation scheduled
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 border-transparent">Active</Badge>
            )}
            <h1 className="text-xl font-semibold text-foreground">BOMY Platform Membership</h1>
          </div>

          <dl className="mb-8 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium text-foreground">Annual</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Price</dt>
              <dd className="font-medium text-foreground">{priceMyr}/yr</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Current period</dt>
              <dd className="font-medium text-foreground">
                {formatDate(sub.periodStart)} – {formatDate(sub.periodEnd)}
              </dd>
            </div>
            {isCancelling ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Active until</dt>
                <dd className="font-medium text-foreground">{formatDate(sub.periodEnd)}</dd>
              </div>
            ) : (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Renews on</dt>
                <dd className="font-medium text-foreground">{formatDate(sub.periodEnd)}</dd>
              </div>
            )}
          </dl>

          <div className="border-t border-border pt-6">
            {isCancelling ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Your membership will remain active until{" "}
                <strong>{formatDate(sub.periodEnd)}</strong>. Automatic renewal has been cancelled.
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  Cancelling will stop automatic renewal. Your membership stays active until{" "}
                  <strong>{formatDate(sub.periodEnd)}</strong>.
                </p>
                <form action={cancelMembership}>
                  <SubmitButton className="w-full rounded-xl border border-destructive/30 bg-background px-6 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors">
                    Cancel membership
                  </SubmitButton>
                </form>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
