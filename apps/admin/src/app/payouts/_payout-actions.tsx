"use client"

import { useState } from "react"
import { CircleCheck, CircleX, Clock, X } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@bomy/ui/button"
import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"
import { Textarea } from "@bomy/ui/textarea"
import { humanizePayoutError } from "@/lib/payout-error-copy"
import { markPayoutCompleted, markPayoutFailed, markPayoutProcessing } from "./actions"

interface Props {
  payoutId: string
  status: "pending" | "processing" | "completed" | "failed"
}

export function PayoutActions({ payoutId, status }: Props) {
  const [localStatus, setLocalStatus] = useState(status)
  const [showComplete, setShowComplete] = useState(false)
  const [showFail, setShowFail] = useState(false)
  const [manualRef, setManualRef] = useState("")
  const [failNotes, setFailNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  async function doProcessing() {
    setLoading(true)
    setError(null)
    const r = await markPayoutProcessing(payoutId)
    setLoading(false)
    if (r.ok) {
      setLocalStatus("processing")
      toast.success("Payout marked processing.")
    } else {
      const copy = humanizePayoutError("markProcessing", r.error)
      setError(copy.message)
      toast[copy.toast](copy.message)
    }
  }

  async function doComplete() {
    setLoading(true)
    setError(null)
    const r = await markPayoutCompleted(payoutId, manualRef)
    setLoading(false)
    if (r.ok) {
      setLocalStatus("completed")
      setShowComplete(false)
      toast.success("Payout marked completed.")
    } else {
      const copy = humanizePayoutError("markCompleted", r.error)
      setError(copy.message)
      toast[copy.toast](copy.message)
    }
  }

  async function doFail() {
    setLoading(true)
    setError(null)
    const r = await markPayoutFailed(payoutId, failNotes)
    setLoading(false)
    if (r.ok) {
      setLocalStatus("failed")
      setShowFail(false)
      toast.success("Payout marked failed.")
    } else {
      const copy = humanizePayoutError("markFailed", r.error)
      setError(copy.message)
      toast[copy.toast](copy.message)
    }
  }

  if (localStatus === "completed" || localStatus === "failed") {
    return <span className="text-xs text-muted-foreground capitalize">{localStatus}</span>
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {error && <p className="text-destructive">{error}</p>}

      {localStatus === "pending" && (
        <Button
          size="sm"
          variant="secondary"
          icon={<Clock />}
          onClick={() => {
            void doProcessing()
          }}
          disabled={loading}
          className="bg-info-subtle text-info hover:bg-info-subtle hover:brightness-95"
        >
          Processing
        </Button>
      )}

      {!showComplete && !showFail && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowComplete(true)}
          className="border-success/40 text-success hover:bg-success-subtle hover:text-success"
        >
          Complete
        </Button>
      )}

      {showComplete && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`manual-ref-${payoutId}`} className="sr-only">
            Manual reference
          </Label>
          <Input
            id={`manual-ref-${payoutId}`}
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
            placeholder="Manual ref (required)"
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              icon={<CircleCheck />}
              onClick={() => {
                void doComplete()
              }}
              disabled={loading || !manualRef.trim()}
              variant="success"
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<X />}
              arrowOnHover={false}
              onClick={() => setShowComplete(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showComplete && !showFail && (
        <Button size="sm" variant="destructive" onClick={() => setShowFail(true)}>
          Fail
        </Button>
      )}

      {showFail && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`fail-notes-${payoutId}`} className="sr-only">
            Fail notes
          </Label>
          <Textarea
            id={`fail-notes-${payoutId}`}
            value={failNotes}
            onChange={(e) => setFailNotes(e.target.value)}
            placeholder="Notes (required)"
            rows={2}
            className="min-h-0 text-xs"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              icon={<CircleX />}
              onClick={() => {
                void doFail()
              }}
              disabled={loading || !failNotes.trim()}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<X />}
              arrowOnHover={false}
              onClick={() => setShowFail(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
