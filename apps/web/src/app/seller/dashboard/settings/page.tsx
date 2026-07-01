import { redirect } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"

import { schema, withPublicRead, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { SettingsForm } from "./settings-form"

export const metadata = { title: "Store Settings" }

export default async function SellerSettingsPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const [storeRow, allCategories] = await Promise.all([
    withTenant(getDb(), { userId: session.user.id, userRole: session.user.role }, async (tx) => {
      const [store] = await tx
        .select({ id: schema.stores.id, excerpt: schema.stores.excerpt })
        .from(schema.stores)
        .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
        .limit(1)
      return store ?? null
    }),
    withPublicRead(getDb(), (tx) =>
      tx
        .select({ id: schema.storeCategories.id, name: schema.storeCategories.name })
        .from(schema.storeCategories)
        .where(eq(schema.storeCategories.isActive, true))
        .orderBy(asc(schema.storeCategories.sortOrder), asc(schema.storeCategories.name)),
    ),
  ])

  if (!storeRow) redirect("/seller/dashboard")

  // Load current category assignments
  const assigned = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    (tx) =>
      tx
        .select({ storeCategoryId: schema.storeCategoryAssignments.storeCategoryId })
        .from(schema.storeCategoryAssignments)
        .innerJoin(
          schema.stores,
          and(
            eq(schema.stores.id, schema.storeCategoryAssignments.storeId),
            eq(schema.stores.ownerId, session.user.id),
          ),
        ),
  )

  const assignedIds = new Set(assigned.map((r) => r.storeCategoryId))

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Store Settings</h1>
      <SettingsForm
        currentExcerpt={storeRow.excerpt ?? ""}
        allCategories={allCategories}
        assignedCategoryIds={[...assignedIds]}
      />
    </div>
  )
}
