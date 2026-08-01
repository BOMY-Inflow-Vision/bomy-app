"use client"

import { useState } from "react"

import { BrandStoryField } from "@/components/brand-story-field"

export function StoreBodyField() {
  const [html, setHtml] = useState("")
  return (
    <div>
      <input type="hidden" name="bodyHtml" value={html} readOnly />
      <BrandStoryField value={html} onChange={setHtml} ariaLabel="Brand story editor" />
    </div>
  )
}
