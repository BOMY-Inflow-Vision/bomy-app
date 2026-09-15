"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"

export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={copied ? <Check /> : <Copy />}
      arrowOnHover={!copied}
      title={id}
      onClick={() => {
        void navigator.clipboard.writeText(id).then(
          () => {
            toast.success("Copied.")
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => {
            toast.error("Couldn't copy — select and copy it manually.")
          },
        )
      }}
      className="mt-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
    >
      <span className="inline-flex items-center gap-1">
        <span>{id.slice(0, 8)}…</span>
        <span className="font-sans text-primary">{copied ? "Copied!" : "Copy ID"}</span>
      </span>
    </Button>
  )
}
