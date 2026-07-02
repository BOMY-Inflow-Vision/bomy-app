"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

import { confirmDelivery } from "./actions"

interface Props {
  orderId: string
}

export function ConfirmDeliveryButton({ orderId }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    const result = await confirmDelivery(orderId)
    if (result.ok) {
      window.location.reload()
    } else {
      setError("Could not confirm delivery. Please try again.")
      setPending(false)
    }
  }

  return (
    <div>
      <Button onClick={() => void handleClick()} disabled={pending} size="lg">
        {pending ? "Confirming…" : "Confirm delivery received"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
