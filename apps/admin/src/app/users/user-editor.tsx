"use client"

import { useState, useTransition } from "react"

import { updateUserProfile } from "./actions"

export function UserEditor({
  userId,
  name,
  email,
}: {
  userId: string
  name: string | null
  email: string
}) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(name ?? "")
  const [emailVal, setEmailVal] = useState(email)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <div>
        <div className="font-medium text-gray-900">{name ?? "—"}</div>
        <div className="text-xs text-gray-400">{email}</div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 text-xs text-indigo-600 hover:underline"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        value={nameVal}
        onChange={(e) => setNameVal(e.target.value)}
        placeholder="Name"
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      />
      {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
      <input
        value={emailVal}
        onChange={(e) => setEmailVal(e.target.value)}
        placeholder="Email"
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      />
      {errors.email && <span className="text-xs text-red-600">{errors.email}</span>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErrors({})
            startTransition(async () => {
              const res = await updateUserProfile(userId, { name: nameVal, email: emailVal })
              if (res.ok) setEditing(false)
              else setErrors(res.errors)
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
            setNameVal(name ?? "")
            setEmailVal(email)
            setErrors({})
          }}
          className="text-xs text-gray-500 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
