"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={id}
      onClick={() => {
        void navigator.clipboard.writeText(id)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="mt-1 inline-flex h-auto items-center gap-1 p-0 font-mono text-[10px] text-muted-foreground hover:text-foreground"
    >
      <span>{id.slice(0, 8)}…</span>
      <span className="font-sans text-primary">{copied ? "Copied!" : "Copy ID"}</span>
    </Button>
  )
}
