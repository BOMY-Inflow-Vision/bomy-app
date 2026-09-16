"use client"

import { useState, useTransition } from "react"
import { CircleX } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { rejectInquiry } from "./actions"

export function RejectButton({ inquiryId }: { inquiryId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="link"
        size="sm"
        icon={<CircleX />}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await rejectInquiry(inquiryId)
            if (!res.ok) {
              setError(res.error)
              toast.error(res.error)
              return
            }
            toast.success("Inquiry rejected.")
          })
        }
        className="text-sm text-amber-600"
      >
        {pending ? "Rejecting…" : "Reject"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
