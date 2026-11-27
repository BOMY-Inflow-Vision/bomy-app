import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { PageHeading } from "@/components/page-heading"
import { Stepper } from "@/components/ui/stepper"

import { listAddresses } from "../account/addresses/actions"
import { readCheckoutEnabled } from "@/lib/active-psp"
import { orderCheckoutPsp } from "@/lib/payments-enabled"
import { sessionAccountExists } from "@/lib/session-account"

import { CheckoutForm } from "./_form"
import { CHECKOUT_STEPS } from "./steps"
import { PageMain } from "@/components/page-main"

export default async function CheckoutPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=/checkout")
  }

  // A JWT session survives up to 30 days and is not re-validated per request, so a deleted
  // account can still look signed in. Send it to sign-in instead of rendering checkout (the old
  // audited flag read did this implicitly through its actor FK). Read-only; a DB error throws.
  if (!(await sessionAccountExists(session.user))) {
    redirect("/auth/sign-in?callbackUrl=/checkout")
  }

  // Read-only public-flag lookup (migration 0041): writes nothing, fails closed.
  let enabled = await readCheckoutEnabled()
  // Same provider check as initiateCheckout, so the page never looks open while the action
  // refuses (unknown or unconfigured active_psp). Independent of subscriptions_enabled.
  if (enabled) enabled = (await orderCheckoutPsp()) !== null
  if (!enabled) {
    return (
      <PageMain narrow>
        <PageHeading title="Checkout" className="mb-4" />
        <div className="rounded-bento border border-dashed border-input bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Checkout is paused. We&apos;ll let you know when it&apos;s back.
          </p>
        </div>
      </PageMain>
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
    <PageMain narrow>
      <PageHeading title="Checkout" className="mb-4" />
      <Stepper
        steps={CHECKOUT_STEPS}
        currentStep={1}
        aria-label="Checkout progress"
        className="mb-8"
      />
      <CheckoutForm savedAddresses={savedAddresses} />
    </PageMain>
  )
}
