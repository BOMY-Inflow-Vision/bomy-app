import Link from "next/link"
import { notFound } from "next/navigation"

import { BodyRenderer } from "@/components/body-renderer"
import { Button } from "@/components/ui/button"
import { VideoEmbed } from "@/components/video-embed"

import { getStorePage } from "./queries"

interface Props {
  params: Promise<{ slug: string }>
}

function ProductCard({
  storeSlug,
  product,
}: {
  storeSlug: string
  product: { id: string; name: string; slug: string; coverImageUrl: string | null }
}) {
  return (
    <li key={product.id}>
      <Link
        href={`/products/${storeSlug}/${product.slug}`}
        className="group block overflow-hidden rounded-xl border border-border bg-background shadow-sm hover:shadow-md"
      >
        <div className="aspect-square bg-muted">
          {product.coverImageUrl ? (
            <img
              src={product.coverImageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl text-muted-foreground">
              📦
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
            {product.name}
          </p>
        </div>
      </Link>
    </li>
  )
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params
  const data = await getStorePage(slug)
  if (!data) notFound()

  const { store, categorySections, uncategorized } = data

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-8 text-center text-2xl font-bold text-foreground">{store.name}</h1>

      <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          {store.bodyHtml && (
            <div className="prose prose-sm max-w-none text-foreground">
              <BodyRenderer html={store.bodyHtml} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {store.videoId && <VideoEmbed videoId={store.videoId} title={`${store.name} video`} />}
          <Button asChild className="self-start">
            <Link href={`/brands/${store.slug}/subscribe`}>Subscribe</Link>
          </Button>
        </div>
      </div>

      {categorySections.length === 0 && uncategorized.products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No products yet.
        </p>
      ) : (
        <>
          {categorySections.map((section) => (
            <section key={section.category.slug} className="mb-10">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-foreground">{section.category.name}</h2>
                {section.hasMore && (
                  <Link
                    href={`/brands/${store.slug}/products?category=${section.category.slug}`}
                    className="text-sm text-primary hover:underline"
                  >
                    View all in {section.category.name}
                  </Link>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {section.products.map((product) => (
                  <ProductCard key={product.id} storeSlug={store.slug} product={product} />
                ))}
              </ul>
            </section>
          ))}

          {uncategorized.products.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-foreground">Uncategorized</h2>
                {uncategorized.hasMore && (
                  <Link
                    href={`/brands/${store.slug}/products?category=__uncategorized`}
                    className="text-sm text-primary hover:underline"
                  >
                    View all
                  </Link>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {uncategorized.products.map((product) => (
                  <ProductCard key={product.id} storeSlug={store.slug} product={product} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
