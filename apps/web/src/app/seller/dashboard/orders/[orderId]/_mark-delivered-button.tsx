"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PackageCheck } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"

import { markDelivered } from "./actions"

const ERROR_COPY: Record<"UNAUTHENTICATED" | "NOT_FOUND", string> = {
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  NOT_FOUND: "This order can't be updated right now — it may have changed. Refresh and try again.",
}

export function MarkDeliveredButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    const result = await markDelivered(orderId)
    if (result.ok) {
      router.refresh()
      toast.success("Order marked as delivered")
      setPending(false)
    } else {
      setError("Could not mark as delivered.")
      toast.error(ERROR_COPY[result.error])
      setPending(false)
    }
  }

  return (
    <div>
      <Button
        onClick={() => void handleClick()}
        icon={<PackageCheck />}
        disabled={pending}
        className="bg-green-700 hover:bg-green-800 text-white"
      >
        {pending ? "Marking…" : "Mark as delivered"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
