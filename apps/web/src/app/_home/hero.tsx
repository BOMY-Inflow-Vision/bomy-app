import { ArrowRight, Truck } from "lucide-react"
import Link from "next/link"

import { CoverImage } from "@/components/cover-image"
import { formatMyrSen } from "@/lib/format"

import type { HOME_COPY } from "./home-copy"
import type { HomeData } from "./home-types"

type HeroCopy = (typeof HOME_COPY)["hero"]

const LINK_BASE =
  "inline-flex min-w-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-center text-sm font-medium [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

// Static classes, so Tailwind sees every one of them.
const DELIVERY_SPAN = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
} as const

// The first screen: one headline card, an optional card for the newest product that has a cover,
// an optional link tile, and a delivery tile. Every word comes from `copy`; names, store and price
// are real data. The shapes are drawn here and hidden from screen readers.
export function Hero({ data, copy }: { data: HomeData; copy: HeroCopy }) {
  const { featured } = data
  const hasProducts = data.counts.products > 0
  const deliverySpan = featured ? (hasProducts ? 1 : 2) : hasProducts ? 2 : 3

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
          className="group flex min-w-0 flex-col overflow-hidden rounded-bento bg-tint p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:col-start-3 lg:row-span-2 lg:row-start-1"
        >
          <p className="mb-3 px-1 font-mono text-xs uppercase tracking-eyebrow text-muted-foreground [overflow-wrap:anywhere]">
            {copy.featured.label}
          </p>
          <div className="relative aspect-tile w-full overflow-hidden rounded-3xl bg-card">
            <CoverImage src={featured.coverImageUrl} alt={featured.name} />
          </div>
          <div className="mt-4 min-w-0 px-1">
            <p className="line-clamp-2 text-lg font-medium text-foreground [overflow-wrap:anywhere] group-hover:text-primary">
              {featured.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">{featured.storeName}</p>
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

      {hasProducts ? (
        <Link
          href="/products"
          data-home="hero-themed"
          className="group relative min-w-0 overflow-hidden rounded-bento bg-secondary p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-8"
        >
          <p className="min-w-0 font-display text-display-sm text-foreground [overflow-wrap:anywhere]">
            {copy.themed.title}
          </p>
          <p className="mt-3 flex min-w-0 items-start gap-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            <span className="min-w-0">{copy.themed.sub}</span>
            <ArrowRight
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 transition-transform duration-300 ease-out-expo group-hover:translate-x-1 motion-reduce:transition-none"
            />
          </p>
        </Link>
      ) : null}

      <div
        data-home="hero-delivery"
        className={`relative min-w-0 overflow-hidden rounded-bento bg-ink p-6 text-ink-foreground sm:p-8 ${DELIVERY_SPAN[deliverySpan]}`}
      >
        <div data-decor aria-hidden="true" className="mb-6 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Truck className="size-5" />
          </span>
          <svg viewBox="0 0 200 8" className="h-2 min-w-0 flex-1 text-ink-muted">
            <line
              x1="2"
              y1="4"
              x2="198"
              y2="4"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="1 10"
            />
          </svg>
        </div>
        <p className="min-w-0 text-lg font-medium [overflow-wrap:anywhere]">
          {copy.delivery.title}
        </p>
        <p className="mt-1 min-w-0 text-sm text-ink-muted [overflow-wrap:anywhere]">
          {copy.delivery.sub}
        </p>
      </div>
    </section>
  )
}
