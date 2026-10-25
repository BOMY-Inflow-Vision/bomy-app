import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { CreditCard, Eye } from "lucide-react"

import { auth } from "@/auth"
import { BodyRenderer } from "@/components/body-renderer"
import { PageHeading } from "@/components/page-heading"
import { ProductCard } from "@/components/product-card"
import { AvatarGroup } from "@/components/ui/avatar-group"
import { Button } from "@bomy/ui/button"
import { VideoEmbed } from "@/components/video-embed"

import { getBrandSubscriberAvatars, getStorePage } from "./queries"
import { PageMain } from "@/components/page-main"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getStorePage(slug)
  if (!data) return {}

  const { store } = data
  const title = store.metaTitle ?? store.name
  const description = store.metaDescription ?? store.excerpt ?? store.description ?? undefined

  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      ...(store.ogImageUrl ? { images: [store.ogImageUrl] } : {}),
    },
  }
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params
  const data = await getStorePage(slug)
  if (!data) notFound()

  const { store, categorySections, uncategorized } = data

  // Gated to signed-in visitors: getBrandSubscriberAvatars runs under an audited
  // admin-bypass (RLS blocks a public-read context from seeing another user's row), and
  // this is the highest-traffic public/SEO surface in the app — calling it unconditionally
  // would write an admin_bypass_audit row on every anonymous pageview, including bots and
  // crawlers, defeating that table's purpose as a forensic trail of genuine admin bypasses
  // (PR #145 review, Bob). Signed-in browsing traffic is a small enough fraction to keep
  // the audit trail meaningful, and it's also the more relevant audience for this social
  // proof widget.
  const session = await auth()
  const { avatars: subscriberAvatars, total: subscriberCount } = session
    ? await getBrandSubscriberAvatars(store.id)
    : { avatars: [], total: 0 }

  const actions = (
    <div className="flex min-w-0 flex-col gap-4">
      {store.videoId && <VideoEmbed videoId={store.videoId} title={`${store.name} video`} />}
      <Button asChild icon={<CreditCard />} className="self-start">
        <Link href={`/brands/${store.slug}/subscribe`}>Subscribe</Link>
      </Button>
      {subscriberAvatars.length > 0 && (
        <div className="flex items-center gap-3">
          <AvatarGroup avatars={subscriberAvatars} total={subscriberCount} />
          <p className="text-sm text-muted-foreground">
            {subscriberCount === 1
              ? "1 buyer is subscribed"
              : `${subscriberCount} buyers are subscribed`}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <PageMain className="flex flex-col gap-10">
      <PageHeading title={store.name} align="center" />

      {store.bodyHtml ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="min-w-0 rounded-bento border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Our Story</h2>
            <div className="prose prose-sm min-w-0 max-w-none break-words dark:prose-invert [&_img]:h-auto [&_img]:max-w-full">
              <BodyRenderer html={store.bodyHtml} />
            </div>
          </div>
          {actions}
        </div>
      ) : (
        actions
      )}

      {categorySections.length === 0 && uncategorized.products.length === 0 ? (
        <p className="rounded-bento border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No products yet.
        </p>
      ) : (
        <>
          {categorySections.map((section) => (
            <section key={section.category.slug} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="min-w-0 text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
                  {section.category.name}
                </h2>
                {section.hasMore && (
                  <Button variant="link" size="sm" icon={<Eye />} asChild>
                    <Link
                      href={`/brands/${store.slug}/products?category=${section.category.slug}`}
                      aria-label={`View all in ${section.category.name}`}
                    >
                      View all
                    </Link>
                  </Button>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 sm:gap-y-10 sm:grid-cols-3">
                {section.products.map((product) => (
                  <li key={product.id} className="min-w-0">
                    <ProductCard
                      variant="compact"
                      href={`/products/${store.slug}/${product.slug}`}
                      name={product.name}
                      coverImageUrl={product.coverImageUrl}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {uncategorized.products.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-lg font-semibold text-foreground">Uncategorized</h2>
                {uncategorized.hasMore && (
                  <Button variant="link" size="sm" icon={<Eye />} asChild>
                    <Link href={`/brands/${store.slug}/products?category=__uncategorized`}>
                      View all
                    </Link>
                  </Button>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 sm:gap-y-10 sm:grid-cols-3">
                {uncategorized.products.map((product) => (
                  <li key={product.id} className="min-w-0">
                    <ProductCard
                      variant="compact"
                      href={`/products/${store.slug}/${product.slug}`}
                      name={product.name}
                      coverImageUrl={product.coverImageUrl}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </PageMain>
  )
}
