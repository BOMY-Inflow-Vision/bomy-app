import { and, eq, inArray } from "drizzle-orm"
import { redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { paymentsEnabled } from "@/lib/payments-enabled"
import { SubmitButton } from "@/components/submit-button"
import { joinMembership } from "./actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

const { db } = makeDb()

async function getPriceSen(): Promise<bigint> {
  return withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read platform membership price for landing page" },
    async (tx) => {
      const rows = await tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "platform_membership_price_myr_sen"))
        .limit(1)
      if (!rows[0]) throw new Error("platform_membership_price_myr_sen not in platform_config")
      return BigInt(rows[0].value as number)
    },
  )
}

export default async function MembershipPage() {
  const session = await auth()
  const priceSen = await getPriceSen()
  const priceDisplay = `RM${Number(priceSen) / 100}/yr`
  const enabled = paymentsEnabled()

  // Redirect away if already a member
  if (session) {
    const existing = await withTenant(
      db,
      { userId: session.user.id, userRole: session.user.role },
      async (tx) =>
        tx
          .select({ id: schema.memberSubscriptions.id, status: schema.memberSubscriptions.status })
          .from(schema.memberSubscriptions)
          .where(
            and(
              eq(schema.memberSubscriptions.userId, session.user.id),
              inArray(schema.memberSubscriptions.status, ["active", "pending"]),
            ),
          )
          .limit(1),
    )
    if (existing[0]?.status === "active") redirect("/membership/manage")
    if (existing[0]?.status === "pending") redirect("/membership/success")
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 pt-20">
      <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-500 mb-3">
          #1 Platform Membership
        </p>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Join BOMY</h1>
        <p className="text-gray-500 mb-8 text-sm leading-relaxed">
          Annual membership — shop across all BOMY stores, receive exclusive perks, and unlock a
          Welcome Gift delivered to your door.
        </p>

        <div className="mb-8 rounded-xl bg-amber-50 px-6 py-5">
          <p className="text-4xl font-bold text-amber-600">{priceDisplay}</p>
          <p className="mt-1 text-xs text-amber-700">billed annually · cancel anytime</p>
        </div>

        <ul className="mb-8 space-y-2 text-left text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-500">✓</span>
            Welcome Gift (dispatched within 14 days of activation)
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-500">✓</span>
            Quarterly Goodie Box from BOMY brand partners
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-500">✓</span>
            Early access to new brands and limited drops
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-500">✓</span>
            Member-only vouchers and exclusive pricing
          </li>
        </ul>

        {!enabled ? (
          <div
            role="status"
            className="w-full rounded-xl bg-gray-200 px-6 py-3 text-sm font-semibold text-gray-500 text-center cursor-not-allowed"
          >
            Memberships will reopen soon
          </div>
        ) : session ? (
          <form action={joinMembership}>
            <SubmitButton className="w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700 transition-colors">
              Join now — {priceDisplay}
            </SubmitButton>
          </form>
        ) : (
          <a
            href="/auth/sign-in?callbackUrl=/membership"
            className="block w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700 transition-colors text-center"
          >
            Sign in to join — {priceDisplay}
          </a>
        )}

        <p className="mt-4 text-xs text-gray-400">Payment processed securely · MYR</p>
      </div>
    </main>
  )
}
