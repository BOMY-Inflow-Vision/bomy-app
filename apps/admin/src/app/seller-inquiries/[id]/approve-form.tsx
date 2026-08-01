"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandStoryField } from "@/components/brand-story-field"
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
  const [bodyHtml, setBodyHtml] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Client-side gate is UX only — approveInquiry re-validates authoritatively.
  const canApprove = bodyHtml.trim().length > 0 && videoUrl.trim().length > 0 && !pending

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
      <div>
        <Label className="mb-1 block">Brand Story *</Label>
        <BrandStoryField value={bodyHtml} onChange={setBodyHtml} ariaLabel="Brand story editor" />
      </div>
      <div>
        <Label htmlFor="video-url" className="mb-1 block">
          Video URL *
        </Label>
        <Input
          id="video-url"
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!canApprove}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await approveInquiry(inquiryId, slug, bodyHtml, videoUrl)
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
