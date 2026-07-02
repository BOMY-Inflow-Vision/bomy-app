import Link from "next/link"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

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
          className="flex-1 rounded-lg border border-input px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <Button type="submit">Search</Button>
        {q && (
          <Button variant="outline" asChild>
            <Link
              href={category ? `/products?category=${encodeURIComponent(category)}` : "/products"}
            >
              Clear
            </Link>
          </Button>
        )}
      </form>

      <div className="flex gap-6">
        {/* Category sidebar */}
        <aside className="w-44 shrink-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Categories
          </p>
          <ul className="space-y-1">
            <li>
              <Link
                href={q ? `/products?q=${encodeURIComponent(q)}` : "/products"}
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
            {categories.map((cat) => {
              const href = q
                ? `/products?q=${encodeURIComponent(q)}&category=${cat.id}`
                : `/products?category=${cat.id}`
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

        {/* Product grid */}
        <section aria-label="Product results" className="flex-1">
          <p className="mb-4 text-sm text-muted-foreground">
            {total} product{total !== 1 ? "s" : ""}
            {q ? ` for "${q}"` : ""}
          </p>

          {products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-20 text-center text-sm text-muted-foreground">
              No products found.
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/products/${p.storeSlug}/${p.slug}`}
                    className="group block overflow-hidden rounded-xl border border-border bg-background shadow-sm hover:shadow-md"
                  >
                    <div className="aspect-square bg-muted">
                      {p.coverImageUrl ? (
                        <img
                          src={p.coverImageUrl}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl text-muted-foreground">
                          📦
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      {p.categoryName && <Badge className="mb-1">{p.categoryName}</Badge>}
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {p.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{p.storeName}</p>
                      {p.minPriceSen != null && (
                        <p className="mt-1 text-sm font-semibold text-primary">
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
            <nav aria-label="Products pagination" className="mt-8 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const params = new URLSearchParams()
                if (q) params.set("q", q)
                if (category) params.set("category", category)
                if (p > 1) params.set("page", String(p))
                return (
                  <Link
                    key={p}
                    href={`/products?${params.toString()}`}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md text-sm",
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
