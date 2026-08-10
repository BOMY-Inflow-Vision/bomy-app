import React from "react"

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
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-lg text-muted-foreground">{intro}</p>
        {lastUpdated && (
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        )}
      </div>
      <hr />
      <div className="space-y-6 leading-relaxed text-foreground">{children}</div>
    </main>
  )
}
