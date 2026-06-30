import Link from "next/link"

import { getBrands } from "./queries"

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

export const metadata = { title: "Brands — BOMY" }

export default async function BrandsPage({ searchParams }: Props) {
  const { q, page: pageParam } = await searchParams
  const parsed = parseInt(pageParam ?? "1", 10)
  const page = Number.isFinite(parsed) ? Math.max(1, parsed) : 1

  const { brands, total, totalPages } = await getBrands({
    ...(q && { query: q }),
    page,
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Brands</h1>
        <p className="mt-1 text-sm text-gray-500">Discover sellers on BOMY</p>
      </div>

      {/* Search */}
      <form method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search brands…"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Search
        </button>
        {q && (
          <Link
            href="/brands"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      <p className="mb-4 text-sm text-gray-500">
        {total} brand{total !== 1 ? "s" : ""}
        {q ? ` for "${q}"` : ""}
      </p>

      {brands.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-20 text-center text-sm text-gray-400">
          No brands found.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <li key={b.id}>
              <Link
                href={`/brands/${b.slug}`}
                className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Avatar placeholder — initials */}
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-600">
                  {b.name.charAt(0).toUpperCase()}
                </div>

                <p className="font-semibold text-gray-900 group-hover:text-indigo-600">{b.name}</p>

                {b.description && (
                  <p className="mt-1 line-clamp-2 flex-1 text-sm leading-relaxed text-gray-500">
                    {b.description}
                  </p>
                )}

                <p className="mt-3 text-xs text-gray-400">
                  {b.productCount} product{b.productCount !== 1 ? "s" : ""}
                </p>
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
            if (p > 1) params.set("page", String(p))
            const href = params.size > 0 ? `/brands?${params.toString()}` : "/brands"
            return (
              <Link
                key={p}
                href={href}
                className={`flex h-8 w-8 items-center justify-center rounded-md text-sm ${p === page ? "bg-indigo-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
              >
                {p}
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
