import Link from "next/link"
import { notFound } from "next/navigation"

import { getStorePage } from "./queries"

interface Props {
  params: Promise<{ slug: string }>
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params
  const data = await getStorePage(slug)
  if (!data) notFound()

  const { store, products } = data

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Store header */}
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
            {store.description && (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">
                {store.description}
              </p>
            )}
          </div>
          <Link
            href={`/brands/${store.slug}/subscribe`}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Subscribe
          </Link>
        </div>
      </div>

      {/* Product grid */}
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Products</h2>
      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          No products yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/products/${store.slug}/${p.slug}`}
                className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md"
              >
                <div className="aspect-square bg-gray-100">
                  {p.coverImageUrl ? (
                    <img
                      src={p.coverImageUrl}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-gray-300">
                      📦
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-gray-900 group-hover:text-indigo-600">
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
