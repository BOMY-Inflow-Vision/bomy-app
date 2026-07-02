import { redirect } from "next/navigation"

import { auth } from "@/auth"

import { AccountTabs } from "../account-tabs"
import { listAddresses } from "./actions"
import { AddressManager } from "./address-manager"

export default async function AddressesPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in?callbackUrl=/account/addresses")

  const addresses = await listAddresses()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <AccountTabs active="addresses" />
      <h1 className="mb-6 text-2xl font-bold text-foreground">Saved addresses</h1>
      <AddressManager
        initial={addresses.map((a) => ({
          id: a.id,
          label: a.label,
          name: a.recipientName,
          phone: a.phone,
          line1: a.line1,
          line2: a.line2 ?? "",
          city: a.city,
          postcode: a.postcode,
          state: a.state,
          isDefault: a.isDefault,
        }))}
      />
    </main>
  )
}
