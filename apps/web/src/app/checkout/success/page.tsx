import { Suspense } from "react"

import { SuccessPoller } from "./_poller"

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-4 py-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <SuccessPoller />
    </Suspense>
  )
}
