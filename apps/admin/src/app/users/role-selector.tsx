"use client"

import { USER_ROLES, type UserRole } from "@bomy/db/types"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { updateUserRole } from "./actions"

export function RoleSelector({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  return (
    <form
      action={async (formData) => {
        const role = formData.get("role") as UserRole
        await updateUserRole(userId, role)
      }}
      className="flex items-center gap-2"
    >
      <Label htmlFor={`role-${userId}`} className="sr-only">
        Role
      </Label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={currentRole}
        className="rounded border border-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-xs">
        Save
      </Button>
    </form>
  )
}
