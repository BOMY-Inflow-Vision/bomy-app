"use client"

import { useToast } from "@/components/toaster"
import { ButtonCopy } from "@/components/ui/button-copy"

export function CopyId({ id }: { id: string }) {
  const toast = useToast()

  return (
    <span className="mt-1 inline-flex items-center gap-1.5" title={id}>
      <span className="font-mono text-[10px] text-muted-foreground">{id.slice(0, 8)}…</span>
      <ButtonCopy
        value={id}
        size="sm"
        onCopied={() => toast.success("Copied.")}
        onError={() => toast.error("Couldn't copy — select and copy it manually.")}
      />
    </span>
  )
}
