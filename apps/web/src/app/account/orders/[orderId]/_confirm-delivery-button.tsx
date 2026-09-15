"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"

import { confirmDelivery } from "./actions"

interface Props {
  orderId: string
}

export function ConfirmDeliveryButton({ orderId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    const result = await confirmDelivery(orderId)
    if (result.ok) {
      router.refresh()
      toast.success("Delivery confirmed — thanks!")
      setPending(false)
    } else {
      setError("Could not confirm delivery. Please try again.")
      toast.error("Could not confirm delivery. Please try again.")
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
