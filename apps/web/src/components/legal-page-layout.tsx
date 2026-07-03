import React from "react"

type LegalPageLayoutProps = {
  title: string
  intro: string
  lastUpdated?: string
  children: React.ReactNode
}

export function LegalPageLayout({ title, intro, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-3 text-3xl font-bold">{title}</h1>
      <p className="mb-2 text-lg text-muted-foreground">{intro}</p>
      {lastUpdated && (
        <p className="mb-8 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
      )}
      <hr className="mb-8" />
      <div className="space-y-6 leading-relaxed text-foreground">{children}</div>
    </main>
  )
}
