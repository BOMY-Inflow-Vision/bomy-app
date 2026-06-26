"use client"

import { useTransition } from "react"

import { toggleCategory } from "./actions"

export function ToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => toggleCategory(id, !isActive))}
      className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
    >
      {pending ? "…" : isActive ? "Deactivate" : "Activate"}
    </button>
  )
}
