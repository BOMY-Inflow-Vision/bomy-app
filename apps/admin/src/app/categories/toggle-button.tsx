"use client"

import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { toggleCategory } from "./actions"

export function ToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0 text-xs"
      disabled={pending}
      onClick={() => startTransition(() => toggleCategory(id, !isActive))}
    >
      {pending ? "…" : isActive ? "Deactivate" : "Activate"}
    </Button>
  )
}
