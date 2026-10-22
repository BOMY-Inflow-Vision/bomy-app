import Link from "next/link"

import type { HOME_COPY } from "./home-copy"

const LINK =
  "inline-flex min-w-0 items-center justify-center rounded-full px-6 py-3 text-center text-sm font-medium [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

// Two real links, no form. The page has no newsletter and no sign-up box.
export function Cta({ copy }: { copy: (typeof HOME_COPY)["cta"] }) {
  return (
    <section
      data-home="cta"
      className="min-w-0 rounded-bento bg-ink p-6 text-ink-foreground sm:p-10"
    >
      <h2 className="min-w-0 font-display text-display-sm [overflow-wrap:anywhere]">
        {copy.title}
      </h2>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/seller/apply"
          className={`${LINK} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {copy.sell}
        </Link>
        <Link
          href="/membership"
          className={`${LINK} border border-ink-muted text-ink-foreground hover:bg-ink-foreground/10`}
        >
          {copy.member}
        </Link>
      </div>
    </section>
  )
}
