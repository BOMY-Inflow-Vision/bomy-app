import Link from "next/link"
import { notFound } from "next/navigation"

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
        <Link href={`/brands/${store.slug}`} className="text-sm text-primary hover:underline">
          Back to storefront
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No products found in this category.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/products/${store.slug}/${p.slug}`}
                className="group block overflow-hidden rounded-xl border border-border bg-background shadow-sm hover:shadow-md"
              >
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
                    <div className="flex h-full items-center justify-center text-3xl text-muted-foreground">
                      📦
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {p.name}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
