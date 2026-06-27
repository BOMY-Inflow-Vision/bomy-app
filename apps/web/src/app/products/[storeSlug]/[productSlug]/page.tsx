import Link from "next/link"
import { notFound } from "next/navigation"

import { getProductBySlug } from "../../queries"
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
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/products" className="hover:text-indigo-600">
          Products
        </Link>
        <span>/</span>
        <Link href={`/brands/${product.storeSlug}`} className="hover:text-indigo-600">
          {product.storeName}
        </Link>
        <span>/</span>
        <span className="text-gray-900">{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Images */}
        <ProductImageGallery images={product.images} productName={product.name} />

        {/* Info */}
        <div className="flex flex-col gap-4">
          <div>
            <Link
              href={`/brands/${product.storeSlug}`}
              className="text-xs font-medium uppercase tracking-wide text-indigo-500 hover:underline"
            >
              {product.storeName}
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{product.name}</h1>
          </div>

          {product.description && (
            <p className="text-sm leading-relaxed text-gray-600">{product.description}</p>
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
      </div>
    </main>
  )
}
