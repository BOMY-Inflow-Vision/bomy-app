import { eq, sql } from "drizzle-orm"
import { CircleCheck, CircleX } from "lucide-react"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { pageCount, pageOffset, parsePage, PAGE_SIZE } from "@/lib/pagination"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Pagination } from "@/components/ui/pagination"
import { togglePlanActive } from "./actions"

export default async function BrandPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { id: adminId } = await requireAdmin()
  const page = parsePage((await searchParams).page)

  const { rows, total } = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list brand subscription plans" },
    async (tx) => {
      const rows = await tx
        .select({
          id: schema.brandSubscriptionPlans.id,
          storeName: schema.stores.name,
          storeSlug: schema.stores.slug,
          termMonths: schema.brandSubscriptionPlans.termMonths,
          priceMyrSen: schema.brandSubscriptionPlans.priceMyrSen,
          discountPct: schema.brandSubscriptionPlans.discountPct,
          description: schema.brandSubscriptionPlans.description,
          isActive: schema.brandSubscriptionPlans.isActive,
          createdAt: schema.brandSubscriptionPlans.createdAt,
        })
        .from(schema.brandSubscriptionPlans)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.brandSubscriptionPlans.storeId))
        .orderBy(schema.stores.name, sql`${schema.brandSubscriptionPlans.termMonths} asc`)
        .limit(PAGE_SIZE)
        .offset(pageOffset(page))
      const countRows = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.brandSubscriptionPlans)
      return { rows, total: Number(countRows[0]!.count) }
    },
  )

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-foreground">Brand Subscription Plans</h1>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Price (MYR)</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Toggle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{row.storeName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.storeSlug}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.termMonths}mo</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(Number(row.priceMyrSen) / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.discountPct}%</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {row.description ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "font-medium",
                      row.isActive ? "text-green-600" : "text-muted-foreground",
                    )}
                  >
                    {row.isActive ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <form action={togglePlanActive.bind(null, row.id, !row.isActive)}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      icon={row.isActive ? <CircleX /> : <CircleCheck />}
                      className={cn(
                        "text-xs hover:bg-transparent",
                        row.isActive
                          ? "text-destructive hover:text-destructive"
                          : "text-primary hover:text-primary",
                      )}
                    >
                      {row.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No brand subscription plans found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={pageCount(total)}
          buildHref={(p) => (p > 1 ? `/brand-plans?page=${p}` : "/brand-plans")}
        />
      </Card>
    </div>
  )
}
