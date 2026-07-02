"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import type { CheckoutSessionStatus } from "@bomy/db"

import { Button } from "@/components/ui/button"
import { useCart } from "@/lib/cart"

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
  const { clearCart } = useCart()
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
        if (r.status === "paid") clearCart()
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
  }, [sessionId, router, clearCart])

  if (state.phase === "polling") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Waiting for payment…</h1>
        <p className="text-sm text-muted-foreground">Please wait while we confirm your payment.</p>
      </main>
    )
  }

  if (state.phase === "not_found") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Session not found</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          This checkout session doesn&apos;t exist or has already been processed.
        </p>
        <Button asChild variant="link">
          <Link href="/cart">Back to cart</Link>
        </Button>
      </main>
    )
  }

  if (state.phase === "timed_out") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Still processing</h1>
        <p className="text-sm text-muted-foreground">
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
        <h1 className="mb-2 text-2xl font-bold text-foreground">Payment confirmed</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your order has been placed. You&apos;ll receive a confirmation email shortly.
        </p>
        <Button asChild>
          <Link href="/account/orders">View my orders</Link>
        </Button>
      </main>
    )
  }

  if (status === "failed") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Payment failed</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your payment was not successful. Please try again.
        </p>
        <Button asChild>
          <Link href="/checkout">Try again</Link>
        </Button>
      </main>
    )
  }

  if (status === "expired") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Session expired</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your checkout session has expired. Please return to your cart and try again.
        </p>
        <Button asChild>
          <Link href="/cart">Back to cart</Link>
        </Button>
      </main>
    )
  }

  if (status === "cancelled") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Checkout cancelled</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your checkout was cancelled. Your cart is still saved.
        </p>
        <Button asChild>
          <Link href="/cart">Back to cart</Link>
        </Button>
      </main>
    )
  }

  // payment_review_required | payment_review_resolved
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-center">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Payment under review</h1>
      <p className="text-sm text-muted-foreground">
        Your payment is being reviewed. We&apos;ll email you once it&apos;s resolved.
      </p>
    </main>
  )
}
