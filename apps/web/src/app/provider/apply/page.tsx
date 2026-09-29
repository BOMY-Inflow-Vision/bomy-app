import { redirect } from "next/navigation"

import { auth } from "@/auth"

import { getActiveServiceCategories, getMyOpenApplication } from "./queries"
import { ProviderApplyForm } from "./provider-apply-form"

export default async function ProviderApplyPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/provider/apply")

  const userId = session.user.id
  const userRole = session.user.role

  const existing = await getMyOpenApplication(userId, userRole)
  if (existing) {
    return (
      <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
        <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border text-center">
          <h1 className="text-lg font-semibold text-foreground">You already applied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Status: {existing.status}. Our team will follow up soon.
          </p>
        </div>
      </main>
    )
  }

  const categories = await getActiveServiceCategories(userId, userRole)

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
      <ProviderApplyForm categories={categories} />
    </main>
  )
}
