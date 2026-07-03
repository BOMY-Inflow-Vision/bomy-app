import Link from "next/link"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { getBrands, getStoreCategories } from "./queries"

interface Props {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
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
  const { q, category, page: pageParam } = await searchParams
  const parsed = parseInt(pageParam ?? "1", 10)
  const page = Number.isFinite(parsed) ? Math.max(1, parsed) : 1

  const [{ brands, total, totalPages }, storeCategories] = await Promise.all([
    getBrands({
      ...(q && { query: q }),
      ...(category && { storeCategoryId: category }),
      page,
    }),
    getStoreCategories(),
  ])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Brands</h1>
        <p className="mt-1 text-sm text-muted-foreground">Discover sellers on BOMY</p>
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
          className="flex-1 rounded-lg border border-input px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <Button type="submit">Search</Button>
        {q && (
          <Button variant="outline" asChild>
            <Link href={category ? `/brands?category=${encodeURIComponent(category)}` : "/brands"}>
              Clear
            </Link>
          </Button>
        )}
      </form>

      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Category sidebar */}
        {storeCategories.length > 0 && (
          <aside className="w-full sm:w-44 sm:shrink-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Categories
            </p>
            <ul className="space-y-1">
              <li>
                <Link
                  href={q ? `/brands?q=${encodeURIComponent(q)}` : "/brands"}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm",
                    !category
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  All
                </Link>
              </li>
              {storeCategories.map((cat) => {
                const href = q
                  ? `/brands?q=${encodeURIComponent(q)}&category=${cat.id}`
                  : `/brands?category=${cat.id}`
                return (
                  <li key={cat.id}>
                    <Link
                      href={href}
                      className={cn(
                        "block rounded-md px-3 py-1.5 text-sm",
                        category === cat.id
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      {cat.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}

        {/* Brand grid */}
        <section aria-label="Brand results" className="min-w-0 flex-1">
          <p className="mb-4 text-sm text-muted-foreground">
            {total} brand{total !== 1 ? "s" : ""}
            {q ? ` for "${q}"` : ""}
          </p>

          {brands.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-20 text-center text-sm text-muted-foreground">
              No brands found.
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {brands.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/brands/${b.slug}`}
                    className="group flex h-full flex-col rounded-xl border border-border bg-background p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    {/* Top row: avatar left, category pills top-right */}
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-primary">
                        {b.name.charAt(0).toUpperCase()}
                      </div>
                      {b.categories.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {b.categories.map((cat) => (
                            <Badge key={cat}>{cat}</Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="font-semibold text-foreground group-hover:text-primary">
                      {b.name}
                    </p>

                    {b.excerpt && (
                      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {b.excerpt}
                      </p>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground">
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
                      className="flex h-11 w-11 items-center justify-center text-sm text-muted-foreground"
                      aria-hidden="true"
                    >
                      …
                    </span>
                  )
                }
                const params = new URLSearchParams()
                if (q) params.set("q", q)
                if (category) params.set("category", category)
                if (p > 1) params.set("page", String(p))
                const href = params.size > 0 ? `/brands?${params.toString()}` : "/brands"
                return (
                  <Link
                    key={p}
                    href={href}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-md text-sm",
                      p === page
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {p}
                  </Link>
                )
              })}
            </nav>
          )}
        </section>
      </div>
    </main>
  )
}
