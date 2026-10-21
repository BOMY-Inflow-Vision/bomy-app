import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { getProductBySlug } from "../../queries"
import { BodyRenderer } from "@/components/body-renderer"
import { PageHeading } from "@/components/page-heading"
import { ProductImageGallery } from "./product-image-gallery"
import { VariantPicker } from "./variant-picker"

interface Props {
  params: Promise<{ storeSlug: string; productSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug, productSlug } = await params
  const product = await getProductBySlug(storeSlug, productSlug)
  if (!product) return {}

  const title = product.metaTitle ?? product.name
  const description =
    product.metaDescription ??
    product.description ??
    product.storeExcerpt ??
    product.storeDescription ??
    undefined
  const ogImage = product.ogImageUrl ?? product.coverImageUrl ?? product.images[0]?.url ?? undefined

  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export default async function ProductDetailPage({ params }: Props) {
  const { storeSlug, productSlug } = await params
  const product = await getProductBySlug(storeSlug, productSlug)
  if (!product) notFound()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <li className="min-w-0">
            <Link href="/products" className="hover:text-primary [overflow-wrap:anywhere]">
              Products
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="min-w-0">
            <Link
              href={`/brands/${product.storeSlug}`}
              className="hover:text-primary [overflow-wrap:anywhere]"
            >
              {product.storeName}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="min-w-0 text-foreground [overflow-wrap:anywhere]">
            {product.name}
          </li>
        </ol>
      </nav>

      <article className="grid gap-8 md:grid-cols-2">
        {/* Images */}
        <div className="min-w-0">
          <ProductImageGallery images={product.images} productName={product.name} />
        </div>

        {/* Info */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0">
            <Link
              href={`/brands/${product.storeSlug}`}
              className="mb-2 inline-block max-w-full font-mono text-xs uppercase tracking-eyebrow text-primary hover:underline [overflow-wrap:anywhere]"
            >
              {product.storeName}
            </Link>
            <PageHeading title={product.name} description={product.description} />
          </div>

          <VariantPicker
            product={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              storeId: product.storeId,
              storeName: product.storeName,
              storeSlug: product.storeSlug,
              coverImageUrl: product.coverImageUrl,
            }}
            variants={product.variants.map((v) => ({
              ...v,
              attributes: (v.attributes ?? {}) as Record<string, unknown>,
            }))}
          />
        </div>
      </article>

      {product.bodyHtml && (
        <section
          aria-labelledby="product-details-heading"
          className="mt-16 min-w-0 max-w-3xl rounded-bento border border-border bg-card p-6"
        >
          <h2 id="product-details-heading" className="mb-4 text-xl font-semibold text-foreground">
            Product Details
          </h2>
          <div className="prose min-w-0 max-w-none break-words dark:prose-invert [&_img]:h-auto [&_img]:max-w-full">
            <BodyRenderer html={product.bodyHtml} />
          </div>
        </section>
      )}
    </main>
  )
}
