"use client"

import { USER_ROLES, type UserRole } from "@bomy/db/types"
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
      <select
        name="role"
        defaultValue={currentRole}
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      >
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button type="submit" className="text-xs text-indigo-600 hover:underline">
        Save
      </button>
    </form>
  )
}
