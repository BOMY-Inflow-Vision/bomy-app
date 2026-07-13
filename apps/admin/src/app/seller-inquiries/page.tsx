import Link from "next/link"
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm"

import { INQUIRY_STATUSES, schema, withAdmin, type InquiryStatus } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteInquiry } from "./actions"
import { RejectButton } from "./reject-button"

const STATUS_COLORS: Record<InquiryStatus, string> = {
  pending: "bg-amber-100 text-amber-700 border-transparent",
  approved: "bg-green-100 text-green-700 border-transparent",
  rejected: "bg-red-100 text-red-700 border-transparent",
}

const SORTS = ["created_desc", "created_asc", "status"] as const
type SortKey = (typeof SORTS)[number]

function isStatus(v: string | undefined): v is InquiryStatus {
  return v !== undefined && (INQUIRY_STATUSES as readonly string[]).includes(v)
}

export default async function SellerInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string }>
}) {
  const { id: adminId } = await requireAdmin()
  const { status, q, sort } = await searchParams
  const sortKey: SortKey = (SORTS as readonly string[]).includes(sort ?? "")
    ? (sort as SortKey)
    : "created_desc"

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list inquiries" },
    async (tx) => {
      const filters: SQL[] = []
      if (isStatus(status)) filters.push(eq(schema.sellerInquiries.status, status))
      if (q && q.trim()) {
        const like = `%${q.trim()}%`
        const search = or(
          ilike(schema.sellerInquiries.name, like),
          ilike(schema.sellerInquiries.email, like),
          ilike(schema.sellerInquiries.companyName, like),
          ilike(schema.sellerInquiries.storeName, like),
        )
        if (search) filters.push(search)
      }
      const orderBy =
        sortKey === "created_asc"
          ? asc(schema.sellerInquiries.createdAt)
          : sortKey === "status"
            ? asc(schema.sellerInquiries.status)
            : desc(schema.sellerInquiries.createdAt)

      return tx
        .select()
        .from(schema.sellerInquiries)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(orderBy)
    },
  )

  const buildHref = (next: { status?: string; q?: string; sort?: string }) => {
    const params = new URLSearchParams()
    const s = next.status ?? (isStatus(status) ? status : "")
    const query = next.q ?? q ?? ""
    const so = next.sort ?? sortKey
    if (s) params.set("status", s)
    if (query) params.set("q", query)
    if (so !== "created_desc") params.set("sort", so)
    const qs = params.toString()
    return qs ? `/seller-inquiries?${qs}` : "/seller-inquiries"
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">
          Seller Inquiries
          <Badge variant="secondary" className="ml-2 text-sm font-normal">
            {rows.length}
          </Badge>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 text-sm">
            {["", ...INQUIRY_STATUSES].map((s) => (
              <Link
                key={s || "all"}
                href={buildHref({ status: s })}
                className={cn(
                  "rounded px-3 py-1",
                  (isStatus(status) ? status : "") === s
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s || "All"}
              </Link>
            ))}
          </div>
          <form method="get" className="flex items-center gap-1">
            {isStatus(status) && <input type="hidden" name="status" value={status} />}
            {sortKey !== "created_desc" && <input type="hidden" name="sort" value={sortKey} />}
            <label htmlFor="inquiries-search" className="sr-only">
              Search inquiries
            </label>
            <Input
              id="inquiries-search"
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search…"
              className="h-8 w-40 text-sm"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
        </div>
      </div>

      <div className="mb-2 flex gap-3 text-xs text-muted-foreground">
        <Link href={buildHref({ sort: "created_desc" })} className="hover:text-foreground">
          Newest {sortKey === "created_desc" ? "▾" : ""}
        </Link>
        <Link href={buildHref({ sort: "created_asc" })} className="hover:text-foreground">
          Oldest {sortKey === "created_asc" ? "▴" : ""}
        </Link>
        <Link href={buildHref({ sort: "status" })} className="hover:text-foreground">
          Status {sortKey === "status" ? "▾" : ""}
        </Link>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const dimmed = row.status !== "pending"
          return (
            <div
              key={row.id}
              className={cn(
                "rounded-lg border border-border bg-background p-4",
                dimmed && "opacity-50",
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/seller-inquiries/${row.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span className="text-sm text-muted-foreground">{row.email}</span>
                    <Badge variant="outline" className={STATUS_COLORS[row.status]}>
                      {row.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Company:</span> {row.companyName} &middot;{" "}
                    <span className="font-medium">Store:</span> {row.storeName}
                  </div>
                  {row.message && (
                    <div className="text-sm text-muted-foreground">{row.message}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {row.createdAt.toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {row.status === "pending" ? (
                    <>
                      <Link
                        href={`/seller-inquiries/${row.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Review →
                      </Link>
                      <RejectButton inquiryId={row.id} />
                    </>
                  ) : (
                    <Link
                      href={`/seller-inquiries/${row.id}`}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      View →
                    </Link>
                  )}
                  <form action={deleteInquiry.bind(null, row.id)}>
                    <Button
                      type="submit"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-sm text-destructive"
                    >
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">No inquiries found.</div>
        )}
      </div>
    </div>
  )
}
