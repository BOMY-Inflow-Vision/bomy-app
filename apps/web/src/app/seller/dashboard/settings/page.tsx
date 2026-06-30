import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { SettingsForm } from "./settings-form"

export const metadata = { title: "Store Settings" }

export default async function SellerSettingsPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const store = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({ excerpt: schema.stores.excerpt })
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, session.user.id))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!store) redirect("/seller/dashboard")

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Store Settings</h1>
      <SettingsForm currentExcerpt={store.excerpt ?? ""} />
    </div>
  )
}
