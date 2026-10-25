import Link from "next/link"
import { Search, X } from "lucide-react"

import { BrandCard } from "@/components/brand-card"
import { FilterPill, FilterPills } from "@/components/filter-pill"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@bomy/ui/button"
import { Pagination } from "@bomy/ui/pagination"
import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"

import { getBrands, getStoreCategories } from "./queries"
import { PageMain } from "@/components/page-main"

interface Props {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}

export const metadata = { title: "Brands — BOMY" }

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

  const pageHref = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (category) params.set("category", category)
    if (p > 1) params.set("page", String(p))
    return params.size > 0 ? `/brands?${params.toString()}` : "/brands"
  }

  return (
    <PageMain>
      <PageHeading title="Brands" description="Discover sellers on BOMY" className="mb-6" />

      {/* Search */}
      <form method="get" className="mb-6 flex gap-2">
        <Label htmlFor="brands-search" className="sr-only">
          Search brands
        </Label>
        <Input
          id="brands-search"
          name="q"
          defaultValue={q}
          placeholder="Search brands…"
          className="min-w-0 flex-1"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <Button type="submit" icon={<Search />}>
          Search
        </Button>
        {q && (
          <Button variant="outline" icon={<X />} arrowOnHover={false} asChild>
            <Link href={category ? `/brands?category=${encodeURIComponent(category)}` : "/brands"}>
              Clear
            </Link>
          </Button>
        )}
      </form>

      {storeCategories.length > 0 && (
        <FilterPills label="Filter by category" className="mb-6">
          <FilterPill asChild active={!category}>
            <Link href={q ? `/brands?q=${encodeURIComponent(q)}` : "/brands"}>All</Link>
          </FilterPill>
          {storeCategories.map((cat) => {
            const href = q
              ? `/brands?q=${encodeURIComponent(q)}&category=${cat.id}`
              : `/brands?category=${cat.id}`
            return (
              <FilterPill key={cat.id} asChild active={category === cat.id}>
                <Link href={href}>{cat.name}</Link>
              </FilterPill>
            )
          })}
        </FilterPills>
      )}

      <section aria-label="Brand results" className="min-w-0">
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
              <li key={b.id} className="min-w-0">
                <BrandCard
                  href={`/brands/${b.slug}`}
                  name={b.name}
                  excerpt={b.excerpt}
                  categories={b.categories}
                  productCount={b.productCount}
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
          label="Brands pagination"
          linkAs={Link}
          size="lg"
          collapse
          className="mt-8 flex justify-center gap-1"
        />
      </section>
    </PageMain>
  )
}
