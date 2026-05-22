"use client"

import { useState } from "react"
import { createPayoutRecord } from "../../payouts/actions"

export function CreatePayoutButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setState("loading")
    const result = await createPayoutRecord(orderId)
    if (result.ok) {
      setState("done")
    } else {
      setState("error")
      setError(result.error)
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
      <button
        onClick={() => {
          void handleClick()
        }}
        disabled={state === "loading"}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {state === "loading" ? "Creating…" : "Create Payout Record"}
      </button>
      {state === "error" && error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
