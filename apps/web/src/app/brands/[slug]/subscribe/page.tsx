import { and, desc, eq, inArray } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { isPendingAbandoned } from "@/lib/membership"
import { senToMyr } from "@/lib/money"
import { paymentsEnabled } from "@/lib/payments-enabled"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@bomy/ui/button"
import { PageHeading } from "@/components/page-heading"
import { CreditCard, LogIn } from "lucide-react"
import { getStorePlans, subscribeToBrand } from "./actions"

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
  // One plan sits centred and narrow; two fill two columns; three fill three. Class names only.
  const gridClass =
    plans.length === 1
      ? "grid-cols-1 sm:mx-auto sm:max-w-sm"
      : plans.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-3"

  return (
    <main className="flex flex-col items-center px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <p className="font-mono text-xs uppercase tracking-eyebrow text-primary">
            #2 Brand Subscription
          </p>
          <PageHeading title={store.name} align="center" />
          <p className="text-sm text-muted-foreground">
            Subscribe to unlock exclusive discounts on every order from this brand.
          </p>
        </div>

        <ul className={`grid w-full gap-4 ${gridClass}`}>
          {plans.map((plan) => {
            const termLabel =
              plan.termMonths === 12 ? "12 months" : plan.termMonths === 6 ? "6 months" : "3 months"
            const priceDisplay = `RM${senToMyr(plan.priceMyrSen)}`
            const action = subscribeToBrand.bind(null, plan.id)

            return (
              <li
                key={plan.id}
                className="flex min-w-0 flex-col gap-4 rounded-bento border border-border bg-card p-6 shadow-sm"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    {termLabel}
                  </p>
                  <p className="text-3xl font-bold text-foreground [overflow-wrap:anywhere]">
                    {priceDisplay}
                  </p>
                  <p className="text-xs text-muted-foreground">billed once</p>
                </div>

                <ul className="flex-1 space-y-2 text-sm text-muted-foreground">
                  <li className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    {plan.discountPct}% off every order
                  </li>
                  {plan.description ? (
                    <li className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
                      <span className="mt-0.5 text-primary">✓</span>
                      {plan.description}
                    </li>
                  ) : null}
                </ul>

                {!enabled ? (
                  <div
                    role="status"
                    className="w-full cursor-not-allowed rounded-xl bg-muted px-4 py-2.5 text-center text-sm font-semibold text-muted-foreground"
                  >
                    Subscriptions will reopen soon
                  </div>
                ) : session ? (
                  <form action={action}>
                    <SubmitButton icon={<CreditCard />} className="w-full">
                      Subscribe
                      <span className="sr-only"> — {priceDisplay}</span>
                    </SubmitButton>
                  </form>
                ) : (
                  <Button asChild icon={<LogIn />} className="w-full">
                    <a href={`/auth/sign-in?callbackUrl=/brands/${slug}/subscribe`}>
                      Sign in to subscribe
                    </a>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>

        <p className="text-center text-xs text-muted-foreground">
          Payment processed securely · MYR · One-time charge, no automatic renewal
        </p>
      </div>
    </main>
  )
}
