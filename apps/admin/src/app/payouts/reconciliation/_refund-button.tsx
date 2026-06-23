"use client"

import { useState, useTransition } from "react"

import { refundDuplicateCharge } from "./actions"

export function RefundButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const res = await refundDuplicateCharge(id)
            if (!res.ok) setError(res.error)
          })
        }
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Refunding…" : "Refund"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
