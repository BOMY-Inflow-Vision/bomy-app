import type { Metadata } from "next"

import { Browse } from "./_home/browse"
import { Cta } from "./_home/cta"
import { Favourites } from "./_home/favourites"
import { Hero } from "./_home/hero"
import { HOME_COPY } from "./_home/home-copy"
import { getHomeData } from "./_home/home-queries"
import { Marquee } from "./_home/marquee"
import { PromiseSection } from "./_home/promise"
import { Sellers } from "./_home/sellers"
import { Stats } from "./_home/stats"

// The page reads the database on every request; it must never be prerendered at build time.
export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return { title: HOME_COPY.meta.title, description: HOME_COPY.meta.description }
}

export default async function Home() {
  const data = await getHomeData()
  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-12 px-4 py-8">
      <Hero data={data} copy={HOME_COPY.hero} />
      <Marquee categories={data.categories} copy={HOME_COPY.marquee} />
      <Browse categories={data.categories} copy={HOME_COPY.browse} />
      <Favourites
        products={data.favourites}
        categories={data.categories}
        copy={HOME_COPY.favourites}
      />
      <PromiseSection copy={HOME_COPY.promise} />
      <Stats counts={data.counts} copy={HOME_COPY.stats} />
      <Sellers brands={data.brands} copy={HOME_COPY.sellers} />
      <Cta copy={HOME_COPY.cta} />
    </main>
  )
}
