"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { abandonPendingMembership } from "../actions"

interface Props {
  initialActive: boolean
  /** Pending row created within the grace window — a payment may be in flight. */
  pendingFresh: boolean
}

export function MembershipActivationPoller({ initialActive, pendingFresh }: Props) {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)

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
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-8 w-8 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Membership activated!</h1>
        <p className="text-sm text-gray-500 mb-6">
          Welcome to BOMY. Your Welcome Gift will be dispatched within 14 days.
        </p>
        <Link
          href="/membership/manage"
          className="block w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700 transition-colors text-center"
        >
          View my membership
        </Link>
      </div>
    )
  }

  // No payment in flight (abandoned checkout / nothing pending), or the polling
  // window elapsed without confirmation. Be honest — do NOT claim payment was
  // received — and give the user a real way out instead of a redirect loop.
  if (timedOut || !pendingFresh) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
          <svg
            className="h-8 w-8 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          We haven&apos;t confirmed your payment
        </h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          If you completed payment, confirmation can take a moment — check again shortly. If you
          didn&apos;t finish paying, you can start over.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="block w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700 transition-colors text-center"
        >
          I&apos;ve paid — check again
        </button>
        <form action={abandonPendingMembership} className="mt-3">
          <button
            type="submit"
            className="block w-full rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors text-center"
          >
            Start over
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
        <svg className="h-8 w-8 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
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
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Confirming your payment…</h1>
      <p className="text-sm text-gray-500">Hang tight — this usually takes a few seconds.</p>
    </div>
  )
}
