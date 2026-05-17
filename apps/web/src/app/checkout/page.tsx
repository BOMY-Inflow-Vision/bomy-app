import { redirect } from "next/navigation"

import { auth } from "@/auth"

import { readCheckoutEnabled } from "./actions"
import { CheckoutForm } from "./_form"

export default async function CheckoutPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=/checkout")
  }

  const enabled = await readCheckoutEnabled(session.user.id)
  if (!enabled) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Checkout</h1>
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-600">
            Checkout is paused. We&apos;ll let you know when it&apos;s back.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Checkout</h1>
      <CheckoutForm />
    </main>
  )
}
