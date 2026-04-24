import { signOut } from "@/auth"

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/" })
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        Sign out
      </button>
    </form>
  )
}
