import Link from "next/link"
import { notFound } from "next/navigation"

import { getProductBySlug } from "../../queries"
import { BodyRenderer } from "./body-renderer"
import { ProductImageGallery } from "./product-image-gallery"
import { VariantPicker } from "./variant-picker"

interface Props {
  params: Promise<{ storeSlug: string; productSlug: string }>
}

export default async function ProductDetailPage({ params }: Props) {
  const { storeSlug, productSlug } = await params
  const product = await getProductBySlug(storeSlug, productSlug)
  if (!product) notFound()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-primary">
          Products
        </Link>
        <span>/</span>
        <Link href={`/brands/${product.storeSlug}`} className="hover:text-primary">
          {product.storeName}
        </Link>
        <span>/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <article className="grid gap-8 md:grid-cols-2">
        {/* Images */}
        <ProductImageGallery images={product.images} productName={product.name} />

        {/* Info */}
        <div className="flex flex-col gap-4">
          <div>
            <Link
              href={`/brands/${product.storeSlug}`}
              className="text-xs font-medium uppercase tracking-wide text-primary hover:underline"
            >
              {product.storeName}
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{product.name}</h1>
          </div>

          {product.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          )}

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
        <section aria-labelledby="product-details-heading" className="mt-10">
          <h2 id="product-details-heading" className="mb-4 text-xl font-semibold text-foreground">
            Product Details
          </h2>
          <div className="prose max-w-3xl">
            <BodyRenderer html={product.bodyHtml} />
          </div>
        </section>
      )}
    </main>
  )
}
