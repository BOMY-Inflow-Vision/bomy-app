"use client"

import { useTransition } from "react"

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
  const [isAccepting, startAccept] = useTransition()
  const [isDeclining, startDecline] = useTransition()
  const isPending = isAccepting || isDeclining

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() =>
          startAccept(async () => {
            await acceptConsent()
          })
        }
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isAccepting && <Spinner />}I Agree
      </button>
      <button
        onClick={() =>
          startDecline(async () => {
            await declineConsent()
          })
        }
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeclining && <Spinner />}
        Decline
      </button>
    </div>
  )
}
