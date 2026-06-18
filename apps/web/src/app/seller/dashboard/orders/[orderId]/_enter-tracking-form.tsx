"use client"

import { useState } from "react"

import { enterTracking } from "./actions"

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

interface Props {
  orderId: string
  currentCarrier: string | null
  currentTracking: string | null
}

export function EnterTrackingForm({ orderId, currentCarrier, currentTracking }: Props) {
  const [carrier, setCarrier] = useState(currentCarrier ?? "")
  const [tracking, setTracking] = useState(currentTracking ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!carrier.trim() || !tracking.trim()) return
    setPending(true)
    setError(null)
    const result = await enterTracking(orderId, carrier.trim(), tracking.trim())
    if (result.ok) {
      window.location.reload()
    } else {
      setError("Could not update tracking. Please try again.")
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-xl border border-gray-200 p-6"
    >
      <h2 className="text-sm font-semibold text-gray-700">Tracking details</h2>
      <input
        type="text"
        placeholder="Carrier (e.g. Pos Laju)"
        value={carrier}
        onChange={(e) => setCarrier(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        type="text"
        placeholder="Tracking number"
        value={tracking}
        onChange={(e) => setTracking(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Spinner />}
        {pending ? "Saving…" : "Save tracking"}
      </button>
    </form>
  )
}
