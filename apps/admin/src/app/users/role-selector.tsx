"use client"

import { type FormEvent, useTransition } from "react"
import { Save } from "lucide-react"

import { USER_ROLES, type UserRole } from "@bomy/db/types"

import { useToast } from "@/components/toaster"
import { Button } from "@bomy/ui/button"
import { Label } from "@bomy/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"
import { updateUserRole } from "./actions"

const ROLE_OPTIONS = USER_ROLES.map((r) => ({ value: r, label: r }))

export function RoleSelector({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  // Submitted via onSubmit rather than <form action>: React 19 resets a form after a function
  // action completes, and Radix Select reverts to its mount value on that reset, so the selector
  // would show (and a second Save would send) the old role after a successful save.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const role = new FormData(event.currentTarget).get("role") as UserRole
    startTransition(async () => {
      const res = await updateUserRole(userId, role)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Role updated to ${role}.`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Label htmlFor={`role-${userId}`} className="sr-only">
        Role
      </Label>
      <Select name="role" defaultValue={currentRole} disabled={pending}>
        <SelectTrigger id={`role-${userId}`} className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        variant="link"
        size="sm"
        icon={<Save />}
        className="text-xs"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  )
}
