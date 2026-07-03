import { redirect } from "next/navigation"

import { auth } from "@/auth"

import { listAddresses } from "../account/addresses/actions"
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
        <h1 className="mb-4 text-2xl font-bold text-foreground">Checkout</h1>
        <div className="rounded-xl border border-dashed border-input bg-muted p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Checkout is paused. We&apos;ll let you know when it&apos;s back.
          </p>
        </div>
      </main>
    )
  }

  const savedAddresses = (await listAddresses()).map((a) => ({
    id: a.id,
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    postcode: a.postcode,
    state: a.state,
    isDefault: a.isDefault,
  }))

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-foreground">Checkout</h1>
      <CheckoutForm savedAddresses={savedAddresses} />
    </main>
  )
}
