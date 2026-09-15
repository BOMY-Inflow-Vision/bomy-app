"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CircleCheck } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { resolvePaymentReview } from "./actions"

export function ResolveForm({ sessionId }: { sessionId: string }) {
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const toast = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setPending(true)
    setError(null)
    const result = await resolvePaymentReview(sessionId, note.trim())
    if (result.ok) {
      toast.success("Payment review resolved.")
      // router.refresh() (not window.location.reload()) so the success toast stays visible —
      // this re-runs the server component, which reads the session fresh from the DB and
      // renders the "Resolved" card instead of this form once resolvedBy is set.
      router.refresh()
    } else {
      const message =
        result.error === "FORBIDDEN" ? "Not authorized." : "Could not resolve session."
      setError(message)
      toast.error(message)
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
      <Button type="submit" disabled={pending || !note.trim()} icon={<CircleCheck />}>
        {pending ? "Resolving…" : "Mark resolved"}
      </Button>
    </form>
  )
}
