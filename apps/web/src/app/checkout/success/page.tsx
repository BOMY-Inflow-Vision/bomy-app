import { Suspense } from "react"

import { SuccessPoller } from "./_poller"

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-4 py-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
          </div>
          <p className="text-sm text-gray-600">Loading…</p>
        </main>
      }
    >
      <SuccessPoller />
    </Suspense>
  )
}
