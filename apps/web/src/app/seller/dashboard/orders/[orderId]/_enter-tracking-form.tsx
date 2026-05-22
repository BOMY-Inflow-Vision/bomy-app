"use client"

import { useState } from "react"

import { enterTracking } from "./actions"

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
        className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save tracking"}
      </button>
    </form>
  )
}
