"use client"

import { signOut } from "next-auth/react"

import { Button } from "@/components/ui/button"

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        void signOut({ callbackUrl: "/" })
      }}
    >
      Sign out
    </Button>
  )
}
