"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

import { acceptConsent, declineConsent } from "./actions"

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export function ConsentActions() {
  const [pending, setPending] = useState<"agree" | "decline" | null>(null)

  const handleAgree = async () => {
    setPending("agree")
    await acceptConsent()
  }

  const handleDecline = async () => {
    setPending("decline")
    await declineConsent()
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={() => void handleAgree()} disabled={pending !== null} className="w-full">
        {pending === "agree" && <Spinner />}I Agree
      </Button>
      <Button
        variant="outline"
        onClick={() => void handleDecline()}
        disabled={pending !== null}
        className="w-full"
      >
        {pending === "decline" && <Spinner />}
        Decline
      </Button>
    </div>
  )
}
