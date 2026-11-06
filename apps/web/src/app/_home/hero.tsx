import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { ProductTile } from "@/components/product-card"
import { RatingRow } from "@/components/rating-row"
import { formatMyrSen } from "@/lib/format"

import type { HOME_COPY } from "./home-copy"
import type { HomeData } from "./home-types"

type HeroCopy = (typeof HOME_COPY)["hero"]

const LINK_BASE =
  "inline-flex min-w-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-center text-sm font-medium [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

// The first screen: one headline card and an optional card for the newest product that has a cover.
// Every word comes from `copy`; names, store and price are real data. The shapes are drawn here and
// hidden from screen readers.
export function Hero({ data, copy }: { data: HomeData; copy: HeroCopy }) {
  const { featured } = data

  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-3">
      <div
        data-home="hero-headline"
        className={`relative min-w-0 overflow-hidden rounded-bento border border-border bg-card p-6 sm:p-10 ${featured ? "lg:col-span-2" : "lg:col-span-3"}`}
      >
        <div data-decor aria-hidden="true" className="pointer-events-none absolute inset-0">
          <svg viewBox="0 0 400 300" className="absolute -right-10 -top-10 h-64 w-80 text-tint">
            <circle cx="260" cy="120" r="110" fill="currentColor" />
          </svg>
          <svg
            viewBox="0 0 100 100"
            className="absolute bottom-6 right-8 hidden size-16 text-primary sm:block"
          >
            <path d="M50 8 L61 39 L92 50 L61 61 L50 92 L39 61 L8 50 L39 39 Z" fill="currentColor" />
          </svg>
        </div>
        <div className="relative min-w-0">
          <p className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground [overflow-wrap:anywhere]">
            {copy.eyebrow}
          </p>
          <h1 className="mt-4 min-w-0 font-display text-display text-foreground [overflow-wrap:anywhere]">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground [overflow-wrap:anywhere]">
            {copy.sub}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/products"
              className={`${LINK_BASE} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {copy.primary}
            </Link>
            <Link
              href="/brands"
              className={`${LINK_BASE} border border-input bg-background text-foreground hover:bg-accent`}
            >
              {copy.secondary}
            </Link>
          </div>
        </div>
      </div>

      {featured ? (
        <Link
          href={`/products/${featured.storeSlug}/${featured.slug}`}
          data-home="hero-featured"
          className="group flex min-w-0 flex-col overflow-hidden rounded-bento bg-tint p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:col-start-3 lg:row-start-1"
        >
          <p className="mb-3 px-1 font-mono text-xs uppercase tracking-eyebrow text-muted-foreground [overflow-wrap:anywhere]">
            {copy.featured.label}
          </p>
          <ProductTile
            tone={`/products/${featured.storeSlug}/${featured.slug}`}
            name={featured.name}
            coverImageUrl={featured.coverImageUrl}
            cutout={featured.coverIsCutout}
            focalX={featured.coverFocalX}
            focalY={featured.coverFocalY}
            className="w-full"
          />
          <div className="mt-4 min-w-0 px-1">
            <p className="line-clamp-2 text-lg font-medium text-foreground [overflow-wrap:anywhere] group-hover:text-primary">
              {featured.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">{featured.storeName}</p>
            <RatingRow
              avg={featured.ratingAvg}
              count={featured.ratingCount}
              className="mt-1 block"
            />
            {featured.minPriceSen !== null && (
              <p
                data-home="hero-featured-price"
                className="mt-1 text-sm font-semibold text-primary-text"
              >
                {`from ${formatMyrSen(featured.minPriceSen)}`}
              </p>
            )}
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
              {copy.featured.cta}
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-300 ease-out-expo group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </p>
          </div>
        </Link>
      ) : null}
    </section>
  )
}
