import type { Metadata } from "next"

import { Reveal } from "@/components/motion/reveal"

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
    <div className="px-3 sm:px-5">
      <main className="mx-auto min-w-0 max-w-[1400px] space-y-12 py-8">
        <Hero data={data} copy={HOME_COPY.hero} />
        <Marquee categories={data.categories} copy={HOME_COPY.marquee} />
        <Reveal>
          <Browse categories={data.categories} copy={HOME_COPY.browse} />
        </Reveal>
        <Reveal>
          <Favourites
            products={data.favourites}
            categories={data.categories}
            copy={HOME_COPY.favourites}
          />
        </Reveal>
        <Reveal>
          <PromiseSection copy={HOME_COPY.promise} />
        </Reveal>
        <Reveal>
          <Stats counts={data.counts} copy={HOME_COPY.stats} />
        </Reveal>
        <Reveal>
          <Sellers brands={data.brands} copy={HOME_COPY.sellers} />
        </Reveal>
        <Reveal>
          <Cta copy={HOME_COPY.cta} />
        </Reveal>
      </main>
    </div>
  )
}
