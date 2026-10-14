import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Package } from "lucide-react"

import { Button } from "@bomy/ui/button"
import { Card } from "@bomy/ui/card"

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{store.name}</h1>
        <Button variant="link" size="sm" icon={<ArrowLeft />} arrowOnHover={false} asChild>
          <Link href={`/brands/${store.slug}`}>Back to storefront</Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <Card className="border-dashed bg-transparent shadow-none">
          <p className="py-16 text-center text-sm text-muted-foreground">
            No products found in this category.
          </p>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/products/${store.slug}/${p.slug}`}
                className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="overflow-hidden bg-background hover:shadow-md">
                  <div className="aspect-square bg-muted">
                    {p.coverImageUrl ? (
                      <img
                        src={p.coverImageUrl}
                        alt={p.name}
                        width={400}
                        height={400}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Package aria-hidden="true" className="size-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {p.name}
                    </p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
