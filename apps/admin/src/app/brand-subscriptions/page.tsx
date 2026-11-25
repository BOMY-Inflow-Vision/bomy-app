import Link from "next/link"
import { and, desc, eq, sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { pageCount, pageOffset, parsePage, PAGE_SIZE } from "@/lib/pagination"
import { statusVariant } from "@/lib/status-badge"
import { Badge } from "@bomy/ui/badge"
import { FilterTab, FilterTabs } from "@bomy/ui/filter-tabs"
import { PageFrame } from "@/components/admin-ui/page-frame"
import { PageHeader } from "@/components/admin-ui/page-header"
import { Tile } from "@/components/admin-ui/tile"
import { Pagination } from "@/components/ui/pagination"

import { StoreFilter } from "./store-filter"
import { normalizeStoreId } from "./store-filter-helpers"

export default async function BrandSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; storeId?: string; page?: string }>
}) {
  const { id: adminId } = await requireAdmin()
  const { status, storeId: storeIdParam, page: pageParam } = await searchParams
  const page = parsePage(pageParam)

  const stores = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list stores for brand sub filter" },
    async (tx) =>
      tx
        .selectDistinct({ id: schema.stores.id, name: schema.stores.name })
        .from(schema.stores)
        .innerJoin(
          schema.brandSubscriptions,
          eq(schema.brandSubscriptions.storeId, schema.stores.id),
        )
        .orderBy(schema.stores.name),
  )

  const activeStoreId = normalizeStoreId(storeIdParam, stores)

  const { rows, total } = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list brand subscriptions" },
    async (tx) => {
      const conditions = []
      if (
        status &&
        ["pending", "active", "cancelled", "expired", "payment_failed"].includes(status)
      ) {
        conditions.push(
          eq(
            schema.brandSubscriptions.status,
            status as "pending" | "active" | "cancelled" | "expired" | "payment_failed",
          ),
        )
      }
      if (activeStoreId) {
        conditions.push(eq(schema.brandSubscriptions.storeId, activeStoreId))
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = await tx
        .select({
          id: schema.brandSubscriptions.id,
          buyerEmail: schema.users.email,
          storeName: schema.stores.name,
          storeId: schema.stores.id,
          termMonths: schema.brandSubscriptionPlans.termMonths,
          priceMyrSen: schema.brandSubscriptions.priceMyrSen,
          discountPct: schema.brandSubscriptions.discountPct,
          status: schema.brandSubscriptions.status,
          periodEnd: schema.brandSubscriptions.periodEnd,
          pspPaymentRequestId: schema.brandSubscriptions.pspPaymentRequestId,
        })
        .from(schema.brandSubscriptions)
        .innerJoin(schema.users, eq(schema.users.id, schema.brandSubscriptions.userId))
        .innerJoin(schema.stores, eq(schema.stores.id, schema.brandSubscriptions.storeId))
        .innerJoin(
          schema.brandSubscriptionPlans,
          eq(schema.brandSubscriptionPlans.id, schema.brandSubscriptions.planId),
        )
        .where(where)
        .orderBy(desc(sql`${schema.brandSubscriptions.createdAt}`))
        .limit(PAGE_SIZE)
        .offset(pageOffset(page))
      const countRows = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.brandSubscriptions)
        .where(where)
      return { rows, total: Number(countRows[0]!.count) }
    },
  )

  const buildHref = (next: { status?: string; storeId?: string; page?: number }) => {
    const s = next.status ?? status ?? ""
    const sid = next.storeId ?? activeStoreId
    // Any filter change (no explicit page) resets to page 1 — staying on the current
    // page could land past the end of a narrower result set.
    const p = next.page ?? 1
    const params = new URLSearchParams()
    if (s) params.set("status", s)
    if (sid) params.set("storeId", sid)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `/brand-subscriptions?${qs}` : "/brand-subscriptions"
  }

  return (
    <PageFrame>
      <PageHeader title="Brand Subscriptions">
        <FilterTabs label="Filter by status" className="gap-1 text-sm">
          {["", "pending", "active", "cancelled", "expired", "payment_failed"].map((s) => (
            <FilterTab key={s} asChild variant="inverse" active={status === s || (!status && !s)}>
              <Link href={buildHref({ status: s })}>{s || "All"}</Link>
            </FilterTab>
          ))}
        </FilterTabs>
        {stores.length > 0 && (
          <div>
            <StoreFilter
              value={activeStoreId}
              allHref={buildHref({ storeId: "" })}
              options={stores.map((s) => ({
                id: s.id,
                name: s.name,
                href: buildHref({ storeId: s.id }),
              }))}
            />
          </div>
        )}
      </PageHeader>
      <Tile className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Price (MYR)</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period End</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-foreground">{row.buyerEmail}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.storeName}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.termMonths}mo</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(Number(row.priceMyrSen) / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.discountPct}%</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.periodEnd.toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No brand subscriptions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={pageCount(total)}
          buildHref={(p) => buildHref({ page: p })}
        />
      </Tile>
    </PageFrame>
  )
}
