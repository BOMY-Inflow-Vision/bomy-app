import Link from "next/link"

import { formatMyrSen, getCategories, getProducts } from "./queries"

interface Props {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}

export const metadata = { title: "Products — BOMY" }

export default async function ProductsPage({ searchParams }: Props) {
  const { q, category, page: pageParam } = await searchParams
  const parsed = parseInt(pageParam ?? "1", 10)
  const page = Number.isFinite(parsed) ? Math.max(1, parsed) : 1

  const [{ products, total, totalPages }, categories] = await Promise.all([
    getProducts({
      ...(q && { query: q }),
      ...(category && { categoryId: category }),
      page,
    }),
    getCategories(),
  ])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Search bar */}
      <form method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search products…"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Search
        </button>
        {q && (
          <Link
            href={category ? `/products?category=${encodeURIComponent(category)}` : "/products"}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="flex gap-6">
        {/* Category sidebar */}
        <aside className="w-44 shrink-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Categories
          </p>
          <ul className="space-y-1">
            <li>
              <Link
                href={q ? `/products?q=${encodeURIComponent(q)}` : "/products"}
                className={`block rounded-md px-3 py-1.5 text-sm ${!category ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700 hover:bg-gray-50"}`}
              >
                All
              </Link>
            </li>
            {categories.map((cat) => {
              const href = q
                ? `/products?q=${encodeURIComponent(q)}&category=${cat.id}`
                : `/products?category=${cat.id}`
              return (
                <li key={cat.id}>
                  <Link
                    href={href}
                    className={`block rounded-md px-3 py-1.5 text-sm ${category === cat.id ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    {cat.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* Product grid */}
        <div className="flex-1">
          <p className="mb-4 text-sm text-gray-500">
            {total} product{total !== 1 ? "s" : ""}
            {q ? ` for "${q}"` : ""}
          </p>

          {products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-20 text-center text-sm text-gray-400">
              No products found.
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/products/${p.storeSlug}/${p.slug}`}
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
                      <p className="truncate text-xs text-gray-500">{p.storeName}</p>
                      {p.minPriceSen != null && (
                        <p className="mt-1 text-sm font-semibold text-indigo-600">
                          from {formatMyrSen(p.minPriceSen)}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const params = new URLSearchParams()
                if (q) params.set("q", q)
                if (category) params.set("category", category)
                if (p > 1) params.set("page", String(p))
                return (
                  <Link
                    key={p}
                    href={`/products?${params.toString()}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-sm ${p === page ? "bg-indigo-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {p}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
