import Link from "next/link"
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm"

import { INQUIRY_STATUSES, schema, withAdmin, type InquiryStatus } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { deleteInquiry } from "./actions"
import { RejectButton } from "./reject-button"

const STATUS_COLORS: Record<InquiryStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
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
  const session = await auth()
  if (!session) return null
  const { status, q, sort } = await searchParams
  const sortKey: SortKey = (SORTS as readonly string[]).includes(sort ?? "")
    ? (sort as SortKey)
    : "created_desc"

  const rows = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin list inquiries" },
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
        <h1 className="text-lg font-semibold text-gray-900">
          Seller Inquiries
          <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-sm font-normal text-gray-500">
            {rows.length}
          </span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 text-sm">
            {["", ...INQUIRY_STATUSES].map((s) => (
              <Link
                key={s || "all"}
                href={buildHref({ status: s })}
                className={`rounded px-3 py-1 ${
                  (isStatus(status) ? status : "") === s
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {s || "All"}
              </Link>
            ))}
          </div>
          <form method="get" className="flex items-center gap-1">
            {isStatus(status) && <input type="hidden" name="status" value={status} />}
            {sortKey !== "created_desc" && <input type="hidden" name="sort" value={sortKey} />}
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search…"
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600">
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mb-2 flex gap-3 text-xs text-gray-500">
        <Link href={buildHref({ sort: "created_desc" })} className="hover:text-gray-800">
          Newest {sortKey === "created_desc" ? "▾" : ""}
        </Link>
        <Link href={buildHref({ sort: "created_asc" })} className="hover:text-gray-800">
          Oldest {sortKey === "created_asc" ? "▴" : ""}
        </Link>
        <Link href={buildHref({ sort: "status" })} className="hover:text-gray-800">
          Status {sortKey === "status" ? "▾" : ""}
        </Link>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const dimmed = row.status !== "pending"
          return (
            <div
              key={row.id}
              className={`rounded-lg border border-gray-200 bg-white p-4 ${dimmed ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/seller-inquiries/${row.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span className="text-sm text-gray-500">{row.email}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Company:</span> {row.companyName} &middot;{" "}
                    <span className="font-medium">Store:</span> {row.storeName}
                  </div>
                  {row.message && <div className="text-sm text-gray-500">{row.message}</div>}
                  <div className="text-xs text-gray-400">{row.createdAt.toLocaleString()}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {row.status === "pending" ? (
                    <>
                      <Link
                        href={`/seller-inquiries/${row.id}`}
                        className="text-sm text-indigo-600 hover:underline"
                      >
                        Review →
                      </Link>
                      <RejectButton inquiryId={row.id} />
                    </>
                  ) : (
                    <Link
                      href={`/seller-inquiries/${row.id}`}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      View →
                    </Link>
                  )}
                  <form action={deleteInquiry.bind(null, row.id)}>
                    <button type="submit" className="text-sm text-red-500 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <div className="py-12 text-center text-gray-400">No inquiries found.</div>
        )}
      </div>
    </div>
  )
}
