"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

  async function doProcessing() {
    setLoading(true)
    setError(null)
    const r = await markPayoutProcessing(payoutId)
    setLoading(false)
    if (r.ok) setLocalStatus("processing")
    else setError(r.error)
  }

  async function doComplete() {
    setLoading(true)
    setError(null)
    const r = await markPayoutCompleted(payoutId, manualRef)
    setLoading(false)
    if (r.ok) {
      setLocalStatus("completed")
      setShowComplete(false)
    } else setError(r.error)
  }

  async function doFail() {
    setLoading(true)
    setError(null)
    const r = await markPayoutFailed(payoutId, failNotes)
    setLoading(false)
    if (r.ok) {
      setLocalStatus("failed")
      setShowFail(false)
    } else setError(r.error)
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
          onClick={() => {
            void doProcessing()
          }}
          disabled={loading}
          className="bg-blue-100 text-blue-700 hover:bg-blue-200"
        >
          → Processing
        </Button>
      )}

      {!showComplete && !showFail && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowComplete(true)}
          className="bg-green-100 text-green-700 hover:bg-green-200"
        >
          Complete
        </Button>
      )}

      {showComplete && (
        <div className="flex flex-col gap-1">
          <Input
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
            placeholder="Manual ref (required)"
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => {
                void doComplete()
              }}
              disabled={loading || !manualRef.trim()}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowComplete(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showComplete && !showFail && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowFail(true)}
          className="bg-red-100 text-red-700 hover:bg-red-200"
        >
          Fail
        </Button>
      )}

      {showFail && (
        <div className="flex flex-col gap-1">
          <Textarea
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
              onClick={() => {
                void doFail()
              }}
              disabled={loading || !failNotes.trim()}
            >
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowFail(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
