"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { refundDuplicateCharge } from "./actions"

export function RefundButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const res = await refundDuplicateCharge(id)
            if (!res.ok) setError(res.error)
          })
        }
      >
        {pending ? "Refunding…" : "Refund"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
