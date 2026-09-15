"use client"

import { useTransition } from "react"
import { Save } from "lucide-react"

import { USER_ROLES, type UserRole } from "@bomy/db/types"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { updateUserRole } from "./actions"

export function RoleSelector({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  function submit(formData: FormData) {
    const role = formData.get("role") as UserRole
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
    <form action={submit} className="flex items-center gap-2">
      <Label htmlFor={`role-${userId}`} className="sr-only">
        Role
      </Label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={currentRole}
        disabled={pending}
        className="rounded border border-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      >
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
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
