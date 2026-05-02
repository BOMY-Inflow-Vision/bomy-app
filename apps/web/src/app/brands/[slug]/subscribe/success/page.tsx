import { and, desc, eq, inArray } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { BrandSubscriptionPoller } from "./poller"

const { db } = makeDb()

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
    db,
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
    db,
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({ status: schema.brandSubscriptions.status })
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

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-20 px-4">
      <BrandSubscriptionPoller initialActive={sub?.status === "active"} storeName={store.name} />
    </main>
  )
}
