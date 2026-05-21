"use client"

import { useState } from "react"

import { markDelivered } from "./actions"

export function MarkDeliveredButton({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    const result = await markDelivered(orderId)
    if (result.ok) {
      window.location.reload()
    } else {
      setError("Could not mark as delivered.")
      setPending(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => void handleClick()}
        disabled={pending}
        className="rounded-xl bg-green-700 px-6 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
      >
        {pending ? "Marking…" : "Mark as delivered"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
