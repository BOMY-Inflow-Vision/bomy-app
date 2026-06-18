"use client"

import { useState } from "react"

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
      <button
        onClick={() => void handleAgree()}
        disabled={pending !== null}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending === "agree" && <Spinner />}I Agree
      </button>
      <button
        onClick={() => void handleDecline()}
        disabled={pending !== null}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending === "decline" && <Spinner />}
        Decline
      </button>
    </div>
  )
}
