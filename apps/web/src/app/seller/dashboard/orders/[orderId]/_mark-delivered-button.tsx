"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

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
      <Button
        onClick={() => void handleClick()}
        disabled={pending}
        className="bg-green-700 hover:bg-green-800 text-white"
      >
        {pending ? "Marking…" : "Mark as delivered"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
