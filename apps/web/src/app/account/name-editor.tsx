"use client"

import { useEffect, useState, useTransition } from "react"
import { Pencil, Save, X } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { updateDisplayName } from "./profile-actions"
import { validateDisplayName } from "./profile-schema"

export function NameEditor({ name }: { name: string | null }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(name)
  const [value, setValue] = useState(name ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Keep in sync if the server re-renders with a fresh name (after revalidate).
  useEffect(() => {
    setDisplayName(name)
    setValue(name ?? "")
  }, [name])

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <p className="truncate text-lg font-semibold text-foreground">{displayName ?? "—"}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Pencil />}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="display-name">Name</Label>
      <div className="flex items-center gap-2">
        <Input
          id="display-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          className="w-full"
        />
        <Button
          type="button"
          size="sm"
          icon={<Save />}
          disabled={pending}
          onClick={() => {
            setError(null)
            const parsed = validateDisplayName(value)
            if (!parsed.ok) {
              setError(parsed.error)
              return
            }
            startTransition(async () => {
              const res = await updateDisplayName(value)
              if (res.ok) {
                setDisplayName(parsed.value)
                setEditing(false)
                toast.success("Name updated")
              } else {
                setError(res.error)
                toast.error(res.error)
              }
            })
          }}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X />}
          arrowOnHover={false}
          disabled={pending}
          onClick={() => {
            setEditing(false)
            setValue(displayName ?? "")
            setError(null)
          }}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
