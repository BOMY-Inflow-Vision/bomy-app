"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { rejectInquiry } from "./actions"

export function RejectButton({ inquiryId }: { inquiryId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="link"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await rejectInquiry(inquiryId)
            if (!res.ok) setError(res.error)
          })
        }
        className="h-auto p-0 text-sm text-amber-600 disabled:opacity-50"
      >
        {pending ? "Rejecting…" : "Reject"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
