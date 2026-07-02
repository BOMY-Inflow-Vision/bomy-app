"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

export function CopyStoreId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-sm text-muted-foreground">{id}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(id)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="h-auto p-0 text-xs font-medium text-primary hover:underline hover:bg-transparent"
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
    </span>
  )
}
