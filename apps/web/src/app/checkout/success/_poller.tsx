"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Eye, RefreshCw } from "lucide-react"

import type { CheckoutSessionStatus } from "@bomy/db"

import { PageHeading } from "@/components/page-heading"
import { useToast } from "@/components/toaster"
import { Button } from "@bomy/ui/button"
import { Stepper } from "@/components/ui/stepper"
import { useCart } from "@/lib/cart"

import { getCheckoutSessionStatus } from "../actions"
import { CHECKOUT_STEPS } from "../steps"
import { PageMain } from "@/components/page-main"

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
  const toast = useToast()
  const searchParams = useSearchParams()
  const rawId = searchParams.get("session") ?? ""
  const sessionId = UUID_RE.test(rawId) ? rawId : null

  const [state, setState] = useState<PollerState>(
    sessionId ? { phase: "polling" } : { phase: "not_found" },
  )
  const toastedRef = useRef(false)

  // Exactly one toast per terminal status, guarded against StrictMode/effect
  // re-runs — the full-page copy above is the primary channel; this just
  // echoes the outcome for consistency with the rest of the site.
  useEffect(() => {
    if (state.phase !== "done") return
    if (toastedRef.current) return
    toastedRef.current = true
    if (state.status === "paid") toast.success("Payment confirmed")
    else if (state.status === "failed") toast.error("Payment failed — please try again")
    else if (state.status === "expired") toast.warning("Your checkout session expired")
  }, [state, toast])

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
      <PageMain narrow className="text-center">
        <Stepper
          steps={CHECKOUT_STEPS}
          currentStep={2}
          aria-label="Checkout progress"
          className="mb-8 text-left"
        />
        <div className="mb-6 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
        <PageHeading title="Waiting for payment…" align="center" className="mb-2" />
        <p className="text-sm text-muted-foreground">Please wait while we confirm your payment.</p>
      </PageMain>
    )
  }

  if (state.phase === "not_found") {
    return (
      <PageMain narrow>
        <PageHeading title="Session not found" className="mb-4" />
        <p className="mb-6 text-sm text-muted-foreground">
          This checkout session doesn&apos;t exist or has already been processed.
        </p>
        <Button asChild variant="link" icon={<ArrowLeft />} arrowOnHover={false}>
          <Link href="/cart">Back to cart</Link>
        </Button>
      </PageMain>
    )
  }

  if (state.phase === "timed_out") {
    return (
      <PageMain narrow className="text-center">
        <PageHeading title="Still processing" align="center" className="mb-4" />
        <p className="text-sm text-muted-foreground">
          Your payment is still being processed. Check your email or contact support if this
          persists.
        </p>
      </PageMain>
    )
  }

  return <DoneView status={state.status} />
}

function DoneView({ status }: { status: CheckoutSessionStatus }) {
  if (status === "paid") {
    return (
      <PageMain narrow className="text-center">
        {/* currentStep is one past the last index so every step (including
            Confirmation) renders as completed rather than "still active". */}
        <Stepper
          steps={CHECKOUT_STEPS}
          currentStep={CHECKOUT_STEPS.length}
          aria-label="Checkout progress"
          className="mb-8 text-left"
        />
        <div className="mb-4 text-4xl">✓</div>
        <PageHeading title="Payment confirmed" align="center" className="mb-2" />
        <p className="mb-6 text-sm text-muted-foreground">
          Your order has been placed. You&apos;ll receive a confirmation email shortly.
        </p>
        <Button asChild icon={<Eye />}>
          <Link href="/account/orders">View my orders</Link>
        </Button>
      </PageMain>
    )
  }

  if (status === "failed") {
    return (
      <PageMain narrow className="text-center">
        <PageHeading title="Payment failed" align="center" className="mb-2" />
        <p className="mb-6 text-sm text-muted-foreground">
          Your payment was not successful. Please try again.
        </p>
        <Button asChild icon={<RefreshCw />}>
          <Link href="/checkout">Try again</Link>
        </Button>
      </PageMain>
    )
  }

  if (status === "expired") {
    return (
      <PageMain narrow className="text-center">
        <PageHeading title="Session expired" align="center" className="mb-2" />
        <p className="mb-6 text-sm text-muted-foreground">
          Your checkout session has expired. Please return to your cart and try again.
        </p>
        <Button asChild icon={<ArrowLeft />} arrowOnHover={false}>
          <Link href="/cart">Back to cart</Link>
        </Button>
      </PageMain>
    )
  }

  if (status === "cancelled") {
    return (
      <PageMain narrow className="text-center">
        <PageHeading title="Checkout cancelled" align="center" className="mb-2" />
        <p className="mb-6 text-sm text-muted-foreground">
          Your checkout was cancelled. Your cart is still saved.
        </p>
        <Button asChild icon={<ArrowLeft />} arrowOnHover={false}>
          <Link href="/cart">Back to cart</Link>
        </Button>
      </PageMain>
    )
  }

  // payment_review_required | payment_review_resolved
  return (
    <PageMain narrow className="text-center">
      <PageHeading title="Payment under review" align="center" className="mb-2" />
      <p className="text-sm text-muted-foreground">
        Your payment is being reviewed. We&apos;ll email you once it&apos;s resolved.
      </p>
    </PageMain>
  )
}
