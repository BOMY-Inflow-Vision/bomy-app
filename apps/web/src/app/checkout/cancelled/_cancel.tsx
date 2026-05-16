"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { cancelPendingCheckout } from "../actions"

type CancelState =
  | { phase: "cancelling" }
  | { phase: "cancelled" }
  | { phase: "redirecting" }
  | { phase: "error" }

export function CancelHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawId = searchParams.get("session") ?? ""

  const [state, setState] = useState<CancelState>({ phase: "cancelling" })

  useEffect(() => {
    let unmounted = false

    async function run() {
      try {
        const r = await cancelPendingCheckout(rawId)
        if (unmounted) return

        if (!r.ok) {
          setState({ phase: "redirecting" })
          router.replace(
            `/auth/sign-in?callbackUrl=${encodeURIComponent(`/checkout/cancelled?session=${rawId}`)}`,
          )
          return
        }
        setState({ phase: "cancelled" })
      } catch {
        if (!unmounted) setState({ phase: "error" })
      }
    }

    void run()
    return () => {
      unmounted = true
    }
  }, [rawId, router])

  if (state.phase === "cancelling" || state.phase === "redirecting") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
        </div>
        <p className="text-sm text-gray-600">Cancelling your checkout…</p>
      </main>
    )
  }

  if (state.phase === "error") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mb-6 text-sm text-gray-600">
          We couldn&apos;t cancel your checkout. Please try again or contact support.
        </p>
        <Link href="/cart" className="text-sm font-medium text-gray-900 underline">
          Back to cart
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-center">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Checkout cancelled</h1>
      <p className="mb-6 text-sm text-gray-600">
        Your checkout has been cancelled. Your cart is still saved.
      </p>
      <Link
        href="/cart"
        className="inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700"
      >
        Back to cart
      </Link>
    </main>
  )
}
