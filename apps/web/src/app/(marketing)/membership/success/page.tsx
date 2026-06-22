import { and, eq, inArray } from "drizzle-orm"
import { redirect } from "next/navigation"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { isPendingAbandoned } from "@/lib/membership"
import { MembershipActivationPoller } from "./poller"

export default async function MembershipSuccessPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership/success")

  const sub = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({
          status: schema.memberSubscriptions.status,
          hitpayPaymentId: schema.memberSubscriptions.hitpayPaymentId,
          createdAt: schema.memberSubscriptions.createdAt,
        })
        .from(schema.memberSubscriptions)
        .where(
          and(
            eq(schema.memberSubscriptions.userId, session.user.id),
            inArray(schema.memberSubscriptions.status, ["active", "pending"]),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
  )

  // Only poll when a payment is genuinely in flight: a pending row created
  // within the grace window. A stale pending row (abandoned checkout) or no row
  // at all must NOT show a "payment received / activating" screen.
  const pendingFresh = sub?.status === "pending" && !isPendingAbandoned(sub, new Date())

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-20 px-4">
      <MembershipActivationPoller
        initialActive={sub?.status === "active"}
        pendingFresh={pendingFresh}
      />
    </main>
  )
}
