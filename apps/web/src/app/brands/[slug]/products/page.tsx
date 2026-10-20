import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@bomy/ui/button"
import { Card } from "@bomy/ui/card"

import { PageHeading } from "@/components/page-heading"
import { ProductCard } from "@/components/product-card"

import { getStoreProducts } from "./queries"

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ category?: string }>
}

export default async function StoreProductsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { category } = await searchParams
  const data = await getStoreProducts(slug, category)
  if (!data) notFound()

  const { store, products } = data

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PageHeading title={store.name} />
        <Button variant="link" size="sm" icon={<ArrowLeft />} arrowOnHover={false} asChild>
          <Link href={`/brands/${store.slug}`}>Back to storefront</Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <Card className="rounded-bento border-dashed bg-transparent shadow-none">
          <p className="py-16 text-center text-sm text-muted-foreground">
            No products found in this category.
          </p>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id} className="min-w-0">
              <ProductCard
                variant="compact"
                href={`/products/${store.slug}/${p.slug}`}
                name={p.name}
                coverImageUrl={p.coverImageUrl}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
