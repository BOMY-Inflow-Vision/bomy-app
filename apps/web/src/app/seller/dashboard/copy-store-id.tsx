"use client"

import { useState } from "react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"

export function CopyStoreId({ id }: { id: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-sm text-muted-foreground">{id}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard
            .writeText(id)
            .then(() => {
              setCopied(true)
              toast.success("Store ID copied.")
              setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => {
              toast.error("Couldn't copy — select and copy it manually.")
            })
        }}
        className="h-auto p-0 text-xs font-medium text-primary hover:underline hover:bg-transparent"
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
    </span>
  )
}
