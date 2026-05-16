"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import type { CheckoutSessionStatus } from "@bomy/db"

import { getCheckoutSessionStatus } from "../actions"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_POLLS = 30
const POLL_MS = 2000

type PollerState =
  | { phase: "polling" }
  | { phase: "not_found" }
  | { phase: "timed_out" }
  | { phase: "done"; status: CheckoutSessionStatus }

export function SuccessPoller() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawId = searchParams.get("session") ?? ""
  const sessionId = UUID_RE.test(rawId) ? rawId : null

  const [state, setState] = useState<PollerState>(
    sessionId ? { phase: "polling" } : { phase: "not_found" },
  )

  useEffect(() => {
    if (!sessionId) return
    const id = sessionId
    let cancelled = false
    let attempts = 0

    async function poll() {
      if (cancelled) return
      attempts++
      const r = await getCheckoutSessionStatus(id)
      if (cancelled) return

      if (!r.ok) {
        if (r.error === "UNAUTHENTICATED") {
          router.replace(
            `/auth/sign-in?callbackUrl=${encodeURIComponent(`/checkout/success?session=${id}`)}`,
          )
        } else {
          setState({ phase: "not_found" })
        }
        return
      }

      if (r.status !== "pending_payment") {
        setState({ phase: "done", status: r.status })
        return
      }
      if (attempts >= MAX_POLLS) {
        setState({ phase: "timed_out" })
        return
      }
      setTimeout(() => {
        void poll()
      }, POLL_MS)
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [sessionId, router])

  if (state.phase === "polling") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Waiting for payment…</h1>
        <p className="text-sm text-gray-600">Please wait while we confirm your payment.</p>
      </main>
    )
  }

  if (state.phase === "not_found") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Session not found</h1>
        <p className="mb-6 text-sm text-gray-600">
          This checkout session doesn&apos;t exist or has already been processed.
        </p>
        <Link href="/cart" className="text-sm font-medium text-gray-900 underline">
          Back to cart
        </Link>
      </main>
    )
  }

  if (state.phase === "timed_out") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Still processing</h1>
        <p className="text-sm text-gray-600">
          Your payment is still being processed. Check your email or contact support if this
          persists.
        </p>
      </main>
    )
  }

  return <DoneView status={state.status} />
}

function DoneView({ status }: { status: CheckoutSessionStatus }) {
  if (status === "paid") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <div className="mb-4 text-4xl">✓</div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment confirmed</h1>
        <p className="mb-6 text-sm text-gray-600">
          Your order has been placed. You&apos;ll receive a confirmation email shortly.
        </p>
        <Link
          href="/account/orders"
          className="inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700"
        >
          View orders
        </Link>
      </main>
    )
  }

  if (status === "failed") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment failed</h1>
        <p className="mb-6 text-sm text-gray-600">
          Your payment was not successful. Please try again.
        </p>
        <Link
          href="/checkout"
          className="inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Try again
        </Link>
      </main>
    )
  }

  if (status === "expired") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Session expired</h1>
        <p className="mb-6 text-sm text-gray-600">
          Your checkout session has expired. Please return to your cart and try again.
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

  if (status === "cancelled") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Checkout cancelled</h1>
        <p className="mb-6 text-sm text-gray-600">
          Your checkout was cancelled. Your cart is still saved.
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

  // payment_review_required | payment_review_resolved
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-center">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment under review</h1>
      <p className="text-sm text-gray-600">
        Your payment is being reviewed. We&apos;ll email you once it&apos;s resolved.
      </p>
    </main>
  )
}
