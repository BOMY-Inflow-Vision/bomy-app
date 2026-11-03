"use client"

import { type FormEvent, useState, useTransition } from "react"
import { Save, Trash2, X } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@bomy/ui/button"
import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"

import {
  adminRemoveRating,
  adminSetRating,
  type AdminRatingErrorCode,
  type AdminRatingResult,
} from "./ratings-actions"

const ERROR_COPY: Record<AdminRatingErrorCode, string> = {
  UNAUTHORIZED: "You don't have permission to do that.",
  INVALID_STARS: "Choose 1 to 5 stars.",
  REASON_REQUIRED: "Write a reason.",
  NOT_FOUND: "This rating no longer exists.",
  ALREADY_REMOVED: "This rating has already been removed.",
}

const STAR_OPTIONS = ["1", "2", "3", "4", "5"] as const

/** Edit-stars and remove controls for one rating row. Shown only to bomy_ops / bomy_admin. */
export function RatingRowActions({
  ratingId,
  currentStars,
}: {
  ratingId: string
  currentStars: number
}) {
  const [stars, setStars] = useState(String(currentStars))
  const [editReason, setEditReason] = useState("")
  const [removeReason, setRemoveReason] = useState("")
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  function report(res: AdminRatingResult, success: string): boolean {
    if (!res.ok) {
      const copy = ERROR_COPY[res.error]
      setError(copy)
      toast.error(copy)
      return false
    }
    setError(null)
    toast.success(`${success} New average ${res.avg} from ${res.count}.`)
    return true
  }

  // Controlled Select + onSubmit (not <form action>): React 19 resets a form after a function
  // action, and Radix Select would snap back to its mount value (see users/role-selector.tsx).
  function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const res = await adminSetRating(ratingId, Number(stars), editReason)
      if (report(res, "Rating updated.")) setEditReason("")
    })
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await adminRemoveRating(ratingId, removeReason)
      if (report(res, "Rating removed.")) {
        setRemoveReason("")
        setConfirmingRemove(false)
      }
    })
  }

  return (
    <div className="flex min-w-64 flex-col gap-2 text-xs">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      <form onSubmit={handleEdit} className="flex flex-wrap items-center gap-1">
        <Label htmlFor={`stars-${ratingId}`} className="sr-only">
          Stars
        </Label>
        <Select value={stars} onValueChange={setStars} disabled={pending}>
          <SelectTrigger id={`stars-${ratingId}`} className="h-7 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAR_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s} ★
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor={`edit-reason-${ratingId}`} className="sr-only">
          Reason for the change
        </Label>
        <Input
          id={`edit-reason-${ratingId}`}
          value={editReason}
          onChange={(e) => setEditReason(e.target.value)}
          placeholder="Reason (required)"
          maxLength={500}
          required
          disabled={pending}
          className="h-7 flex-1 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          icon={<Save />}
          disabled={pending || !editReason.trim()}
        >
          Save
        </Button>
      </form>

      {!confirmingRemove ? (
        <Button
          size="sm"
          variant="outline"
          icon={<Trash2 />}
          className="self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setError(null)
            setConfirmingRemove(true)
          }}
          disabled={pending}
        >
          Remove
        </Button>
      ) : (
        <div className="flex flex-col gap-1 rounded-control border border-destructive/40 p-2">
          <Label htmlFor={`remove-reason-${ratingId}`} className="text-xs font-medium">
            Remove this rating? It stops counting and the buyer cannot rate this product again.
          </Label>
          <Input
            id={`remove-reason-${ratingId}`}
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
            placeholder="Reason (required)"
            maxLength={500}
            required
            disabled={pending}
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              icon={<Trash2 />}
              onClick={handleRemove}
              disabled={pending || !removeReason.trim()}
            >
              {pending ? "Removing…" : "Confirm remove"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<X />}
              arrowOnHover={false}
              onClick={() => setConfirmingRemove(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
