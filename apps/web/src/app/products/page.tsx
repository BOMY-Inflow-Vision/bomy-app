import Link from "next/link"
import { Search, X } from "lucide-react"

import { FilterPill, FilterPills } from "@/components/filter-pill"
import { ProductCard } from "@/components/product-card"
import { Button } from "@bomy/ui/button"
import { Pagination } from "@bomy/ui/pagination"
import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"

import { getCategories, getProducts } from "./queries"

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

  const pageHref = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (category) params.set("category", category)
    if (p > 1) params.set("page", String(p))
    return `/products?${params.toString()}`
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Products</h1>
      {/* Search bar */}
      <form method="get" className="mb-6 flex gap-2">
        <Label htmlFor="products-search" className="sr-only">
          Search products
        </Label>
        <Input
          id="products-search"
          name="q"
          defaultValue={q}
          placeholder="Search products…"
          className="min-w-0 flex-1"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <Button type="submit" icon={<Search />}>
          Search
        </Button>
        {q && (
          <Button variant="outline" icon={<X />} arrowOnHover={false} asChild>
            <Link
              href={category ? `/products?category=${encodeURIComponent(category)}` : "/products"}
            >
              Clear
            </Link>
          </Button>
        )}
      </form>

      <FilterPills label="Filter by category" className="mb-6">
        <FilterPill asChild active={!category}>
          <Link href={q ? `/products?q=${encodeURIComponent(q)}` : "/products"}>All</Link>
        </FilterPill>
        {categories.map((cat) => {
          const href = q
            ? `/products?q=${encodeURIComponent(q)}&category=${cat.id}`
            : `/products?category=${cat.id}`
          return (
            <FilterPill key={cat.id} asChild active={category === cat.id}>
              <Link href={href}>{cat.name}</Link>
            </FilterPill>
          )
        })}
      </FilterPills>

      <section aria-label="Product results" className="min-w-0">
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
              <li key={p.id} className="min-w-0">
                <ProductCard
                  href={`/products/${p.storeSlug}/${p.slug}`}
                  name={p.name}
                  coverImageUrl={p.coverImageUrl}
                  categoryName={p.categoryName}
                  storeName={p.storeName}
                  minPriceSen={p.minPriceSen}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={pageHref}
          label="Products pagination"
          linkAs={Link}
          className="mt-8 flex flex-wrap justify-center gap-2"
        />
      </section>
    </main>
  )
}
