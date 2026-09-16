"use server"

import { signOut } from "@/auth"
import { flashToast } from "@/lib/flash-toast-server"

export async function signOutAction(): Promise<void> {
  await flashToast("info", "You've been signed out.")
  // signOut() throws Next's internal redirect — never wrap it in try/catch.
  await signOut({ redirectTo: "/auth/sign-in" })
}
