"use client"

import { useState } from "react"

import { resolvePaymentReview } from "./actions"

export function ResolveForm({ sessionId }: { sessionId: string }) {
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setPending(true)
    setError(null)
    const result = await resolvePaymentReview(sessionId, note.trim())
    if (result.ok) {
      window.location.reload()
    } else {
      setError(result.error === "FORBIDDEN" ? "Not authorized." : "Could not resolve session.")
      setPending(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <textarea
        placeholder="Resolution note (required)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || !note.trim()}
        className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Resolving…" : "Mark resolved"}
      </button>
    </form>
  )
}
