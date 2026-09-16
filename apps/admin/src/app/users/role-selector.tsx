"use client"

import { useTransition } from "react"
import { Save } from "lucide-react"

import { USER_ROLES, type UserRole } from "@bomy/db/types"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { updateUserRole } from "./actions"

const ROLE_OPTIONS = USER_ROLES.map((r) => ({ value: r, label: r }))

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
      <Select
        id={`role-${userId}`}
        name="role"
        defaultValue={currentRole}
        disabled={pending}
        options={ROLE_OPTIONS}
      />
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
