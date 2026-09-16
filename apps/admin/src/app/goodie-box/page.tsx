import Link from "next/link"
import { and, desc, eq, sql } from "drizzle-orm"
import { PackageCheck } from "lucide-react"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { pageCount, pageOffset, parsePage, PAGE_SIZE } from "@/lib/pagination"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/ui/pagination"
import { markDispatched } from "./actions"

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600",
  dispatched: "text-green-600",
  delivered: "text-blue-600",
}

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
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground">Goodie Box Dispatches</h1>
        <div className="flex gap-1 text-sm">
          {["", "pending", "dispatched", "delivered"].map((s) => (
            <Link
              key={s}
              href={buildHref({ status: s })}
              className={cn(
                "rounded px-3 py-1",
                status === s || (!status && !s)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s || "All"}
            </Link>
          ))}
        </div>
        {quarters.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Quarter:</span>
            <Link
              href={buildHref({ quarter: "" })}
              className={cn(
                "rounded px-2 py-1",
                !quarter
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              All
            </Link>
            {quarters.map((q) => (
              <Link
                key={q.quarter}
                href={buildHref({ quarter: q.quarter })}
                className={cn(
                  "rounded px-2 py-1",
                  quarter === q.quarter
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {q.quarter}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-background">
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
                <td
                  className={cn(
                    "px-4 py-3 font-medium",
                    STATUS_COLORS[row.status] ?? "text-muted-foreground",
                  )}
                >
                  {row.status}
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
                      <label htmlFor={`tracking-${row.id}`} className="sr-only">
                        Tracking number
                      </label>
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
