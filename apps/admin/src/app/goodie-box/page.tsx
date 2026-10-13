import Link from "next/link"
import { and, desc, eq, sql } from "drizzle-orm"
import { PackageCheck } from "lucide-react"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { pageCount, pageOffset, parsePage, PAGE_SIZE } from "@/lib/pagination"
import { statusVariant } from "@/lib/status-badge"
import { Badge } from "@bomy/ui/badge"
import { Button } from "@bomy/ui/button"
import { FilterTab, FilterTabs } from "@bomy/ui/filter-tabs"
import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { markDispatched } from "./actions"

export default async function GoodieBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; status?: string; page?: string }>
}) {
  const { id: adminId } = await requireAdmin()
  const { quarter, status, page: pageParam } = await searchParams
  const page = parsePage(pageParam)

  const quarters = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list goodie box quarters" },
    async (tx) =>
      tx
        .selectDistinct({ quarter: schema.goodieBoxDispatches.quarter })
        .from(schema.goodieBoxDispatches)
        .orderBy(desc(sql`${schema.goodieBoxDispatches.quarter}`)),
  )

  const { rows, total } = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list goodie box dispatches" },
    async (tx) => {
      const conditions = []
      if (quarter) conditions.push(eq(schema.goodieBoxDispatches.quarter, quarter))
      if (status && ["pending", "dispatched", "delivered"].includes(status)) {
        conditions.push(
          eq(schema.goodieBoxDispatches.status, status as "pending" | "dispatched" | "delivered"),
        )
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = await tx
        .select({
          id: schema.goodieBoxDispatches.id,
          userEmail: schema.users.email,
          quarter: schema.goodieBoxDispatches.quarter,
          status: schema.goodieBoxDispatches.status,
          shippingName: schema.goodieBoxDispatches.shippingName,
          trackingNumber: schema.goodieBoxDispatches.trackingNumber,
          dispatchedAt: schema.goodieBoxDispatches.dispatchedAt,
          notes: schema.goodieBoxDispatches.notes,
        })
        .from(schema.goodieBoxDispatches)
        .innerJoin(schema.users, eq(schema.users.id, schema.goodieBoxDispatches.userId))
        .where(where)
        .orderBy(
          desc(sql`${schema.goodieBoxDispatches.quarter}`),
          schema.goodieBoxDispatches.shippingName,
        )
        .limit(PAGE_SIZE)
        .offset(pageOffset(page))
      const countRows = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.goodieBoxDispatches)
        .where(where)
      return { rows, total: Number(countRows[0]!.count) }
    },
  )

  const buildHref = (next: { status?: string; quarter?: string; page?: number }) => {
    const s = next.status ?? status ?? ""
    const q = next.quarter ?? quarter ?? ""
    // Any filter change (no explicit page) resets to page 1 — staying on the current
    // page could land past the end of a narrower result set.
    const p = next.page ?? 1
    const params = new URLSearchParams()
    if (s) params.set("status", s)
    if (q) params.set("quarter", q)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `/goodie-box?${qs}` : "/goodie-box"
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-lg font-semibold text-foreground">Goodie Box Dispatches</h1>
        <FilterTabs label="Filter by status" className="gap-1 text-sm">
          {["", "pending", "dispatched", "delivered"].map((s) => (
            <FilterTab key={s} asChild variant="flat" active={status === s || (!status && !s)}>
              <Link href={buildHref({ status: s })}>{s || "All"}</Link>
            </FilterTab>
          ))}
        </FilterTabs>
        {quarters.length > 0 && (
          <FilterTabs label="Filter by quarter" className="ml-auto items-center gap-2 text-sm">
            <span className="text-muted-foreground">Quarter:</span>
            <FilterTab asChild variant="flat" active={!quarter} className="px-2">
              <Link href={buildHref({ quarter: "" })}>All</Link>
            </FilterTab>
            {quarters.map((q) => (
              <FilterTab
                key={q.quarter}
                asChild
                variant="flat"
                active={quarter === q.quarter}
                className="px-2"
              >
                <Link href={buildHref({ quarter: q.quarter })}>{q.quarter}</Link>
              </FilterTab>
            ))}
          </FilterTabs>
        )}
      </div>
      <div className="relative overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Quarter</th>
              <th className="px-4 py-3">Shipping Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Dispatched</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-foreground">{row.userEmail}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.quarter}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.shippingName}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {row.trackingNumber ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.dispatchedAt?.toLocaleDateString() ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {row.status === "pending" && (
                    <form
                      action={markDispatched.bind(null, row.id)}
                      className="flex items-center gap-2"
                    >
                      <Label htmlFor={`tracking-${row.id}`} className="sr-only">
                        Tracking number
                      </Label>
                      <Input
                        id={`tracking-${row.id}`}
                        name="trackingNumber"
                        placeholder="Tracking no."
                        required
                        className="w-32 text-xs"
                      />
                      <Button
                        type="submit"
                        variant="link"
                        size="sm"
                        icon={<PackageCheck />}
                        className="text-xs"
                      >
                        Mark Dispatched
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No dispatches found.
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
      </div>
    </div>
  )
}
