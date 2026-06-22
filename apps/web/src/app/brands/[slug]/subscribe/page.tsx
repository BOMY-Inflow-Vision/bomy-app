import { and, desc, eq, inArray } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { isPendingAbandoned } from "@/lib/membership"
import { paymentsEnabled } from "@/lib/payments-enabled"
import { SubmitButton } from "@/components/submit-button"
import { getStorePlans, subscribeToBrand } from "./actions"

function senToMyr(sen: bigint): string {
  return `RM${Number(sen) / 100}`
}

interface Props {
  params: Promise<{ slug: string }>
}

export default async function BrandSubscribePage({ params }: Props) {
  const { slug } = await params
  const session = await auth()

  const storeData = await getStorePlans(slug)
  if (!storeData || storeData.plans.length === 0) notFound()

  const { store, plans } = storeData

  // Check for an existing active subscription / in-flight checkout for this store.
  if (session) {
    const existing = await withTenant(
      getDb(),
      { userId: session.user.id, userRole: session.user.role },
      async (tx) => {
        const rows = await tx
          .select({
            status: schema.brandSubscriptions.status,
            hitpayPaymentId: schema.brandSubscriptions.hitpayPaymentId,
            createdAt: schema.brandSubscriptions.createdAt,
          })
          .from(schema.brandSubscriptions)
          .where(
            and(
              eq(schema.brandSubscriptions.userId, session.user.id),
              eq(schema.brandSubscriptions.storeId, store.id),
              inArray(schema.brandSubscriptions.status, ["active", "pending"]),
            ),
          )
          .orderBy(desc(schema.brandSubscriptions.createdAt))
          .limit(1)
        return rows[0] ?? null
      },
    )
    if (existing?.status === "active") redirect(`/brands/${slug}/subscribe/success`)
    // Only forward a genuinely in-flight (fresh) pending checkout to the poller.
    // A stale/abandoned pending row falls through to the Subscribe CTA — clicking
    // it expires the stale row and starts a fresh checkout (see subscribeToBrand).
    if (existing?.status === "pending" && !isPendingAbandoned(existing, new Date()))
      redirect(`/brands/${slug}/subscribe/success`)
  }

  const enabled = paymentsEnabled()

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 pt-20">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-500 mb-2">
            #2 Brand Subscription
          </p>
          <h1 className="text-3xl font-bold text-gray-900">{store.name}</h1>
          <p className="mt-2 text-sm text-gray-500">
            Subscribe to unlock exclusive discounts on every order from this brand.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const termLabel =
              plan.termMonths === 12 ? "12 months" : plan.termMonths === 6 ? "6 months" : "3 months"
            const priceDisplay = senToMyr(plan.priceMyrSen)
            const action = subscribeToBrand.bind(null, plan.id)

            return (
              <div
                key={plan.id}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-2">
                  {termLabel}
                </p>
                <p className="text-3xl font-bold text-gray-900 mb-1">{priceDisplay}</p>
                <p className="text-xs text-gray-400 mb-4">billed once</p>

                <ul className="mb-6 flex-1 space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-indigo-500">✓</span>
                    {plan.discountPct}% off every order
                  </li>
                  {plan.description ? (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-indigo-500">✓</span>
                      {plan.description}
                    </li>
                  ) : null}
                </ul>

                {!enabled ? (
                  <div
                    role="status"
                    className="w-full rounded-xl bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 text-center cursor-not-allowed"
                  >
                    Subscriptions will reopen soon
                  </div>
                ) : session ? (
                  <form action={action}>
                    <SubmitButton className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
                      Subscribe — {priceDisplay}
                    </SubmitButton>
                  </form>
                ) : (
                  <a
                    href={`/auth/sign-in?callbackUrl=/brands/${slug}/subscribe`}
                    className="block w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:bg-indigo-800 transition-colors text-center"
                  >
                    Sign in to subscribe
                  </a>
                )}
              </div>
            )
          })}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Payment processed securely · MYR · One-time charge, no automatic renewal
        </p>
      </div>
    </main>
  )
}
