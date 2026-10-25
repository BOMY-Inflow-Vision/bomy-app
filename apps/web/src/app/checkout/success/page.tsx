import { Suspense } from "react"

import { SuccessPoller } from "./_poller"
import { PageMain } from "@/components/page-main"

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <PageMain narrow className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </PageMain>
      }
    >
      <SuccessPoller />
    </Suspense>
  )
}
