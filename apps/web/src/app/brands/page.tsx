import Link from "next/link"

import { getBrands } from "./queries"

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

export const metadata = { title: "Brands — BOMY" }

function pageRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "...")[] = [1]
  if (current > 3) pages.push("...")
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push("...")
  pages.push(total)
  return pages
}

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
        <label htmlFor="brands-search" className="sr-only">
          Search brands
        </label>
        <input
          id="brands-search"
          name="q"
          defaultValue={q}
          placeholder="Search brands…"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
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

                {b.categories.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {b.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                {b.excerpt && (
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-gray-500">{b.excerpt}</p>
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
        <nav aria-label="Brands pagination" className="mt-8 flex justify-center gap-1">
          {pageRange(page, totalPages).map((p, i) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${i}`}
                  className="flex h-11 w-11 items-center justify-center text-sm text-gray-400"
                  aria-hidden="true"
                >
                  …
                </span>
              )
            }
            const params = new URLSearchParams()
            if (q) params.set("q", q)
            if (p > 1) params.set("page", String(p))
            const href = params.size > 0 ? `/brands?${params.toString()}` : "/brands"
            return (
              <Link
                key={p}
                href={href}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={`flex h-11 w-11 items-center justify-center rounded-md text-sm ${p === page ? "bg-indigo-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
              >
                {p}
              </Link>
            )
          })}
        </nav>
      )}
    </main>
  )
}
