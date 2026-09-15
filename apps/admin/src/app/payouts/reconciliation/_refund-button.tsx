"use client"

import { useState, useTransition } from "react"
import { Undo2 } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { humanizePayoutError } from "@/lib/payout-error-copy"
import { refundDuplicateCharge } from "./actions"

export function RefundButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  return (
    <div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        icon={<Undo2 />}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const res = await refundDuplicateCharge(id)
            if (res.ok) {
              toast.success("Refund issued.")
            } else {
              const copy = humanizePayoutError("refund", res.error)
              setError(copy.message)
              toast[copy.toast](copy.message)
            }
          })
        }
      >
        {pending ? "Refunding…" : "Refund"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
