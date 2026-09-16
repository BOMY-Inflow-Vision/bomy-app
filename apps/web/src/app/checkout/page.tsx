import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { Stepper } from "@/components/ui/stepper"

import { listAddresses } from "../account/addresses/actions"
import { readCheckoutEnabled } from "./actions"
import { CheckoutForm } from "./_form"
import { CHECKOUT_STEPS } from "./steps"

// A JWT session survives up to 30 days (see CLAUDE.md auth notes) and isn't re-validated
// against the DB on every request, so a deleted/orphaned account can still present a
// "signed in" session. readCheckoutEnabled's admin-audit insert is the first write that
// would hit this — surface it as a stale session instead of a raw 500.
function isMissingSessionActor(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23503" &&
    "constraint_name" in err &&
    (err as { constraint_name: unknown }).constraint_name ===
      "admin_bypass_audit_actor_user_id_fkey"
  )
}

export default async function CheckoutPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=/checkout")
  }

  let enabled: boolean
  try {
    enabled = await readCheckoutEnabled(session.user.id)
  } catch (err) {
    if (isMissingSessionActor(err)) {
      redirect("/auth/sign-in?callbackUrl=/checkout")
    }
    throw err
  }
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
      <Stepper
        steps={CHECKOUT_STEPS}
        currentStep={1}
        aria-label="Checkout progress"
        className="mb-8"
      />
      <CheckoutForm savedAddresses={savedAddresses} />
    </main>
  )
}
