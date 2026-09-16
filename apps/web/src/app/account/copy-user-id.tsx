"use client"

import { useToast } from "@/components/toaster"
import { ButtonCopy } from "@/components/ui/button-copy"

export function CopyUserId({ id }: { id: string }) {
  const toast = useToast()

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs text-foreground">{id}</span>
      <ButtonCopy
        value={id}
        onCopied={() => toast.success("User ID copied.")}
        onError={() => toast.error("Couldn't copy — select and copy it manually.")}
      />
    </span>
  )
}
