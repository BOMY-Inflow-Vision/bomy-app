"use client"

import { useState } from "react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { humanizePayoutError } from "@/lib/payout-error-copy"
import { createPayoutRecord } from "../../payouts/actions"

export function CreatePayoutButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function handleClick() {
    setState("loading")
    const result = await createPayoutRecord(orderId)
    if (result.ok) {
      setState("done")
      toast.success("Payout record created.")
    } else {
      setState("error")
      const copy = humanizePayoutError("createPayout", result.error)
      setError(copy.message)
      toast[copy.toast](copy.message)
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-green-600">
        Payout record created.{" "}
        <a href="/payouts" className="underline">
          View in payouts &rarr;
        </a>
      </p>
    )
  }

  return (
    <div>
      <Button
        onClick={() => {
          void handleClick()
        }}
        disabled={state === "loading"}
        size="sm"
      >
        {state === "loading" ? "Creating…" : "Create Payout Record"}
      </Button>
      {state === "error" && error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
