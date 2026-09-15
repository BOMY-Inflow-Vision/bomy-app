"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

import { signOutAction } from "./actions"

function SignOutSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      Sign out
    </Button>
  )
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SignOutSubmit />
    </form>
  )
}
