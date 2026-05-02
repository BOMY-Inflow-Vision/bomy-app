"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Props {
  initialActive: boolean
  storeName: string
}

export function BrandSubscriptionPoller({ initialActive, storeName }: Props) {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (initialActive) return

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
  }, [initialActive, router])

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
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Subscription activated!</h1>
        <p className="text-sm text-gray-500 mb-6">
          You now get a discount on every order from {storeName}.
        </p>
        <Link
          href="/account/subscriptions"
          className="block w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:bg-indigo-800 transition-colors text-center"
        >
          View my subscriptions
        </Link>
      </div>
    )
  }

  if (timedOut) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
          <svg
            className="h-8 w-8 text-indigo-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Payment received</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Your payment was received. Activation sometimes takes a minute — check your subscriptions
          shortly and it will be ready.
        </p>
        <Link
          href="/account/subscriptions"
          className="block w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:bg-indigo-800 transition-colors text-center"
        >
          Check subscription status
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
        <svg className="h-8 w-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
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
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Activating your subscription…</h1>
      <p className="text-sm text-gray-500">
        Payment confirmed. Hang tight — this usually takes a few seconds.
      </p>
    </div>
  )
}
