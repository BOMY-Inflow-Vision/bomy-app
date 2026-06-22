import { and, desc, eq, inArray } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { schema, withAdmin, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { isPendingAbandoned } from "@/lib/membership"
import { BrandSubscriptionPoller } from "./poller"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

interface Props {
  params: Promise<{ slug: string }>
}

export default async function BrandSubscribeSuccessPage({ params }: Props) {
  const { slug } = await params
  const session = await auth()
  if (!session) redirect(`/auth/sign-in?callbackUrl=/brands/${slug}/subscribe/success`)

  // Resolve store by slug.
  const store = await withAdmin(
    getDb(),
    { userId: SYSTEM_ACTOR, reason: "resolve store for brand subscription success page" },
    async (tx) => {
      const rows = await tx
        .select({ id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug })
        .from(schema.stores)
        .where(eq(schema.stores.slug, slug))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!store) notFound()

  const sub = await withTenant(
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

  // Only poll when a payment is genuinely in flight: a pending row created
  // within the grace window. A stale pending row (abandoned checkout) or no row
  // at all must NOT show a "payment received / activating" screen.
  const pendingFresh = sub?.status === "pending" && !isPendingAbandoned(sub, new Date())

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-20 px-4">
      <BrandSubscriptionPoller
        initialActive={sub?.status === "active"}
        pendingFresh={pendingFresh}
        storeSlug={slug}
        storeName={store.name}
      />
    </main>
  )
}
