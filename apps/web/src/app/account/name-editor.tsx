"use client"

import { useEffect, useState, useTransition } from "react"

import { updateDisplayName } from "./profile-actions"
import { validateDisplayName } from "./profile-schema"

export function NameEditor({ name }: { name: string | null }) {
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
        <p className="truncate text-lg font-semibold text-gray-900">{displayName ?? "—"}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-indigo-600 hover:underline"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
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
              } else {
                setError(res.error)
              }
            })
          }}
          className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditing(false)
            setValue(displayName ?? "")
            setError(null)
          }}
          className="text-xs text-gray-500 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
