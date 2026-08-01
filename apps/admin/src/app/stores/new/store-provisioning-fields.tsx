"use client"

import { useState } from "react"
import Link from "next/link"

import { extractYoutubeVideoId } from "@bomy/shared/youtube"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandStoryField } from "@/components/brand-story-field"

const BRAND_STORY_MIN_CHARS = 20

// Client-safe approximation of the server's plain-text floor (apps/admin/src/lib/
// brand-story-validation.ts's extractPlainText) — a plain regex tag-strip plus Unicode
// format-character removal, NOT the node-html-parser-based extraction used server-side,
// since that file's validateStoreProvisioning pulls in the server-only sanitizer and
// must never reach a client bundle. This is a live UX hint only, not a security
// boundary — createStore re-validates with the real extractPlainText server-side
// regardless of what this function reports.
function approxPlainTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim().length
}

export function StoreProvisioningFields() {
  const [html, setHtml] = useState("")
  const [videoUrl, setVideoUrl] = useState("")

  const textLength = approxPlainTextLength(html)
  const bodyValid = textLength >= BRAND_STORY_MIN_CHARS
  const videoValid = extractYoutubeVideoId(videoUrl.trim()) !== null
  const canSubmit = bodyValid && videoValid
  const charsNeeded = BRAND_STORY_MIN_CHARS - textLength

  return (
    <>
      <div>
        <Label className="mb-1 block">Brand Story *</Label>
        <input type="hidden" name="bodyHtml" value={html} readOnly />
        <BrandStoryField value={html} onChange={setHtml} ariaLabel="Brand story editor" />
        <p className="mt-1 text-xs text-muted-foreground">
          {bodyValid
            ? "Looks good."
            : `${charsNeeded} more character${charsNeeded === 1 ? "" : "s"} needed.`}
        </p>
      </div>
      <div>
        <Label htmlFor="videoUrl" className="mb-1 block">
          Video URL *
        </Label>
        <Input
          id="videoUrl"
          name="videoUrl"
          type="url"
          required
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={!canSubmit}>
          Create Store
        </Button>
        <Button variant="outline" asChild>
          <Link href="/stores">Cancel</Link>
        </Button>
      </div>
    </>
  )
}
