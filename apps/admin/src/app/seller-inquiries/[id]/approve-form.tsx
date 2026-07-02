"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { approveInquiry, rejectInquiry } from "../actions"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function ApproveForm({
  inquiryId,
  defaultSlug,
}: {
  inquiryId: string
  defaultSlug: string
}) {
  const [slug, setSlug] = useState(slugify(defaultSlug))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div>
        <Label htmlFor="store-slug" className="mb-1 block">
          Store slug
        </Label>
        <Input
          id="store-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="font-mono"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await approveInquiry(inquiryId, slug)
              if (!res.ok) setError(res.error)
            })
          }
        >
          {pending ? "Working…" : "Approve"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await rejectInquiry(inquiryId)
              if (!res.ok) setError(res.error)
            })
          }
          className="border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          Reject
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
