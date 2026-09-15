"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCw } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"

// Catches unexpected errors from any page, including Server Action failures thrown inside a
// client transition, so the user gets a toast and a way to recover instead of a blank crash.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const toast = useToast()

  React.useEffect(() => {
    console.error(error)
    toast.error("Something went wrong. Please try again.")
  }, [error, toast])

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t finish that. Try again, or head back to the home page.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" icon={<RefreshCw />} onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline" icon={<ArrowLeft />} arrowOnHover={false}>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  )
}
