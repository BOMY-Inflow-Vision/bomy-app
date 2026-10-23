import React from "react"

import { PageHeading } from "@/components/page-heading"

type LegalPageLayoutProps = {
  title: string
  intro: string
  lastUpdated?: string
  children: React.ReactNode
}

export function LegalPageLayout({ title, intro, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <PageHeading title={title} description={intro} />
        {lastUpdated && (
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        )}
      </div>
      <div className="min-w-0 space-y-6 rounded-bento border border-border bg-card p-6 leading-relaxed text-foreground [overflow-wrap:anywhere] sm:p-10">
        {children}
      </div>
    </main>
  )
}
