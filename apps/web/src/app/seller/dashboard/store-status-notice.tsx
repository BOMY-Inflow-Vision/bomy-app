import Link from "next/link"

import { Alert } from "@bomy/ui/alert"

// Shown on the seller overview when the store cannot trade, so the state is hard to miss
// (the small status pill in the store card is easy to overlook).
export function StoreStatusNotice({ status }: { status: string }) {
  if (status === "suspended") {
    return (
      <Alert variant="destructive" role="alert" className="mb-6">
        <p className="font-semibold">Your store is suspended.</p>
        <p className="mt-1 text-sm">
          Buyers cannot see your store or products, and you cannot manage products or settings. You
          can still view your orders and subscriptions.{" "}
          <Link href="/contact" className="font-medium underline">
            Contact us
          </Link>{" "}
          to find out why and how to get it reactivated.
        </p>
      </Alert>
    )
  }
  if (status === "pending") {
    return (
      <Alert variant="warning" role="status" className="mb-6">
        <p className="font-semibold">Your store is waiting for approval.</p>
        <p className="mt-1 text-sm">
          We will let you know once it is active. You cannot manage products until then.
        </p>
      </Alert>
    )
  }
  return null
}
