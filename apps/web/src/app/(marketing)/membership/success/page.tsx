import { and, eq, inArray } from "drizzle-orm"
import { redirect } from "next/navigation"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { MembershipActivationPoller } from "./poller"

const { db } = makeDb()

export default async function MembershipSuccessPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/membership/success")

  const sub = await withTenant(
    db,
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({ status: schema.memberSubscriptions.status })
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

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-20 px-4">
      <MembershipActivationPoller initialActive={sub?.status === "active"} />
    </main>
  )
}
