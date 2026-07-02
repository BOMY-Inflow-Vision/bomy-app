"use client"

import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateUserProfile } from "./actions"
import { validateUserProfile } from "./user-profile-schema"

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
  const [displayName, setDisplayName] = useState(name)
  const [displayEmail, setDisplayEmail] = useState(email)
  const [nameVal, setNameVal] = useState(name ?? "")
  const [emailVal, setEmailVal] = useState(email)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setDisplayName(name)
    setDisplayEmail(email)
    setNameVal(name ?? "")
    setEmailVal(email)
  }, [name, email])

  if (!editing) {
    return (
      <div>
        <div className="font-medium text-foreground">{displayName ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{displayEmail}</div>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setEditing(true)}
          className="mt-1 h-auto p-0 text-xs"
        >
          Edit
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="edit-name" className="sr-only">
        Name
      </Label>
      <Input
        id="edit-name"
        value={nameVal}
        onChange={(e) => setNameVal(e.target.value)}
        placeholder="Name"
        className="h-7 px-2 py-1 text-xs"
      />
      {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
      <Label htmlFor="edit-email" className="sr-only">
        Email
      </Label>
      <Input
        id="edit-email"
        value={emailVal}
        onChange={(e) => setEmailVal(e.target.value)}
        placeholder="Email"
        className="h-7 px-2 py-1 text-xs"
      />
      {errors.email && <span className="text-xs text-destructive">{errors.email}</span>}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={pending}
          onClick={() => {
            setErrors({})
            startTransition(async () => {
              const parsed = validateUserProfile({ name: nameVal, email: emailVal })
              if (!parsed.ok) {
                setErrors(parsed.errors)
                return
              }

              const res = await updateUserProfile(userId, { name: nameVal, email: emailVal })
              if (res.ok) {
                setDisplayName(parsed.value.name)
                setDisplayEmail(parsed.value.email)
                setNameVal(parsed.value.name ?? "")
                setEmailVal(parsed.value.email)
                setEditing(false)
              } else {
                setErrors(res.errors)
              }
            })
          }}
          className="h-auto p-0 text-xs disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setEditing(false)
            setNameVal(displayName ?? "")
            setEmailVal(displayEmail)
            setErrors({})
          }}
          className="h-auto p-0 text-xs text-muted-foreground disabled:opacity-50"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
