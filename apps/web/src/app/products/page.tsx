import Link from "next/link"
import { Search, X } from "lucide-react"

import { CategoryRail } from "@/components/category-rail"
import { FilterPill, RAIL_PILL } from "@/components/filter-pill"
import { PageHeading } from "@/components/page-heading"
import { ProductCard } from "@/components/product-card"
import { productBadge } from "@/lib/product-badge"
import { Button } from "@bomy/ui/button"
import { Pagination } from "@bomy/ui/pagination"
import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"

import { getCategories, getProducts } from "./queries"
import { PageMain } from "@/components/page-main"

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
    <PageMain>
      <div className="mb-6 flex min-w-0 flex-col gap-6 rounded-bento bg-card p-6 sm:p-8 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="mb-3 font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">
            {total} product{total !== 1 ? "s" : ""}
            {q ? ` for "${q}"` : ""}
          </p>
          <PageHeading title="Products" />
        </div>
        <form method="get" className="flex w-full min-w-0 gap-2 md:max-w-md">
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
      </div>

      <div className="lg:grid lg:grid-cols-rail lg:items-start lg:gap-8">
        <CategoryRail label="Filter by category">
          <FilterPill asChild active={!category} className={RAIL_PILL}>
            <Link href={q ? `/products?q=${encodeURIComponent(q)}` : "/products"}>All</Link>
          </FilterPill>
          {categories.map((cat) => {
            const href = q
              ? `/products?q=${encodeURIComponent(q)}&category=${cat.id}`
              : `/products?category=${cat.id}`
            return (
              <FilterPill key={cat.id} asChild active={category === cat.id} className={RAIL_PILL}>
                <Link href={href}>{cat.name}</Link>
              </FilterPill>
            )
          })}
        </CategoryRail>

        <section aria-label="Product results" className="min-w-0">
          {products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-20 text-center text-sm text-muted-foreground">
              No products found.
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <li key={p.id} className="min-w-0">
                  <ProductCard
                    href={`/products/${p.storeSlug}/${p.slug}`}
                    name={p.name}
                    coverImageUrl={p.coverImageUrl}
                    categoryName={p.categoryName}
                    storeName={p.storeName}
                    minPriceSen={p.minPriceSen}
                    badge={productBadge({
                      createdAt: p.createdAt,
                      activeVariantCount: p.activeVariantCount,
                      inStockVariantCount: p.inStockVariantCount,
                      now: new Date(),
                    })}
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
      </div>
    </PageMain>
  )
}
