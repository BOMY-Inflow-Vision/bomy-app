"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"

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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Cancelling your checkout…</p>
      </main>
    )
  }

  if (state.phase === "error") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          We couldn&apos;t cancel your checkout. Please try again or contact support.
        </p>
        <Button asChild variant="link">
          <Link href="/cart">Back to cart</Link>
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-center">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Checkout cancelled</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your checkout has been cancelled. Your cart is still saved.
      </p>
      <Button asChild>
        <Link href="/cart">Back to cart</Link>
      </Button>
    </main>
  )
}
