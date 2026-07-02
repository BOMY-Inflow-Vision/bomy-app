"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
      <div className="space-y-2">
        <Label htmlFor="resolution-note">Resolution note</Label>
        <Textarea
          id="resolution-note"
          placeholder="Resolution note (required)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || !note.trim()}>
        {pending ? "Resolving…" : "Mark resolved"}
      </Button>
    </form>
  )
}
