"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

import { abandonPendingBrandSubscription } from "../actions"

interface Props {
  initialActive: boolean
  /** Pending row created within the grace window — a payment may be in flight. */
  pendingFresh: boolean
  storeSlug: string
  storeName: string
}

export function BrandSubscriptionPoller({
  initialActive,
  pendingFresh,
  storeSlug,
  storeName,
}: Props) {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)
  const abandon = abandonPendingBrandSubscription.bind(null, storeSlug)

  useEffect(() => {
    if (initialActive || !pendingFresh) return

    const deadline = Date.now() + 10_000
    const id = setInterval(() => {
      if (Date.now() >= deadline) {
        setTimedOut(true)
        clearInterval(id)
        return
      }
      router.refresh()
    }, 2000)

    return () => clearInterval(id)
  }, [initialActive, pendingFresh, router])

  if (initialActive) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-background p-10 text-center shadow-sm ring-1 ring-border">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-8 w-8 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">Subscription activated!</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You now get a discount on every order from {storeName}.
        </p>
        <Button asChild className="w-full">
          <Link href="/account/subscriptions">View my subscriptions</Link>
        </Button>
      </div>
    )
  }

  // No payment in flight (abandoned checkout / nothing pending), or the polling
  // window elapsed without confirmation. Be honest — do NOT claim payment was
  // received — and give the user a real way out instead of a redirect loop.
  if (timedOut || !pendingFresh) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-background p-10 text-center shadow-sm ring-1 ring-border">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">
          We haven&apos;t confirmed your payment
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          If you completed payment, confirmation can take a moment — check again shortly. If you
          didn&apos;t finish paying, you can start over.
        </p>
        <Button type="button" className="w-full" onClick={() => router.refresh()}>
          I&apos;ve paid — check again
        </Button>
        <form action={abandon} className="mt-3">
          <Button type="submit" variant="outline" className="w-full">
            Start over
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-background p-10 text-center shadow-sm ring-1 ring-border">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        <svg
          className="h-8 w-8 animate-spin text-primary"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
      <h1 className="mb-2 text-xl font-semibold text-foreground">Activating your subscription…</h1>
      <p className="text-sm text-muted-foreground">
        Payment confirmed. Hang tight — this usually takes a few seconds.
      </p>
    </div>
  )
}
