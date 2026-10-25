import React from "react"

import { PageHeading } from "@/components/page-heading"
import { PageMain } from "@/components/page-main"

type LegalPageLayoutProps = {
  title: string
  intro: string
  lastUpdated?: string
  children: React.ReactNode
}

export function LegalPageLayout({ title, intro, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <PageMain narrow className="py-12" innerClassName="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <PageHeading title={title} description={intro} />
        {lastUpdated && (
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        )}
      </div>
      <div className="min-w-0 space-y-6 rounded-bento border border-border bg-card p-6 leading-relaxed text-foreground [overflow-wrap:anywhere] sm:p-10">
        {children}
      </div>
    </PageMain>
  )
}
