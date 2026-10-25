import Link from "next/link"

import { WordReveal } from "@/components/motion/word-reveal"

import type { HOME_COPY } from "./home-copy"

// A statement card and a membership link. The words are all in the dark text colour. No price: the
// membership fee is read with an admin query and does not belong on this public page.
export function PromiseSection({ copy }: { copy: (typeof HOME_COPY)["promise"] }) {
  return (
    <section data-home="promise" className="grid min-w-0 gap-4 lg:grid-cols-3">
      <div className="min-w-0 rounded-bento bg-tint p-6 sm:p-10 lg:col-span-2">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground [overflow-wrap:anywhere]">
          {copy.eyebrow}
        </p>
        <p
          data-promise-statement
          className="mt-4 min-w-0 font-display text-display-sm text-foreground [overflow-wrap:anywhere]"
        >
          <WordReveal text={copy.statement} />
        </p>
      </div>
      <div className="flex min-w-0 items-center justify-center rounded-bento border border-border bg-card p-6">
        <Link
          href="/membership"
          className="inline-flex min-w-0 items-center justify-center rounded-full bg-primary px-6 py-3 text-center text-sm font-medium text-primary-foreground [overflow-wrap:anywhere] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {copy.chip}
        </Link>
      </div>
    </section>
  )
}
