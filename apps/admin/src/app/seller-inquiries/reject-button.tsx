"use client"

import { useState, useTransition } from "react"

import { rejectInquiry } from "./actions"

export function RejectButton({ inquiryId }: { inquiryId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await rejectInquiry(inquiryId)
            if (!res.ok) setError(res.error)
          })
        }
        className="text-sm text-amber-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Rejecting…" : "Reject"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
