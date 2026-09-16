"use client"

import { useFormStatus } from "react-dom"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"

import { signOutAction } from "./actions"

function SignOutSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" icon={<LogOut />} disabled={pending}>
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
