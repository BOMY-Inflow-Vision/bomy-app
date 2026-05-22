"use client"

import { useState } from "react"

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
    return <span className="text-xs text-gray-400 capitalize">{localStatus}</span>
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {error && <p className="text-red-500">{error}</p>}

      {localStatus === "pending" && (
        <button
          onClick={() => {
            void doProcessing()
          }}
          disabled={loading}
          className="rounded bg-blue-100 px-2 py-1 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
        >
          &rarr; Processing
        </button>
      )}

      {!showComplete && !showFail && (
        <button
          onClick={() => setShowComplete(true)}
          className="rounded bg-green-100 px-2 py-1 text-green-700 hover:bg-green-200"
        >
          Complete
        </button>
      )}

      {showComplete && (
        <div className="flex flex-col gap-1">
          <input
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
            placeholder="Manual ref (required)"
            className="rounded border border-gray-200 px-2 py-1 text-xs"
          />
          <div className="flex gap-1">
            <button
              onClick={() => {
                void doComplete()
              }}
              disabled={loading || !manualRef.trim()}
              className="rounded bg-green-600 px-2 py-1 text-white hover:bg-green-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowComplete(false)}
              className="rounded bg-gray-100 px-2 py-1 text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showComplete && !showFail && (
        <button
          onClick={() => setShowFail(true)}
          className="rounded bg-red-100 px-2 py-1 text-red-700 hover:bg-red-200"
        >
          Fail
        </button>
      )}

      {showFail && (
        <div className="flex flex-col gap-1">
          <textarea
            value={failNotes}
            onChange={(e) => setFailNotes(e.target.value)}
            placeholder="Notes (required)"
            rows={2}
            className="rounded border border-gray-200 px-2 py-1 text-xs"
          />
          <div className="flex gap-1">
            <button
              onClick={() => {
                void doFail()
              }}
              disabled={loading || !failNotes.trim()}
              className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowFail(false)}
              className="rounded bg-gray-100 px-2 py-1 text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
