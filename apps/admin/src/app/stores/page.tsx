import Link from "next/link"
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { approveStore, suspendStore } from "./actions"
import { CopyId } from "./copy-id"

const STATUS_COLORS = {
  pending: "text-amber-600",
  active: "text-green-600",
  suspended: "text-red-600",
}

const STORE_STATUSES = ["pending", "active", "suspended"] as const
type StoreStatusFilter = (typeof STORE_STATUSES)[number]

const SORTS = ["created_desc", "name", "name_desc", "status", "status_desc"] as const
type SortKey = (typeof SORTS)[number]

function isStoreStatus(v: string | undefined): v is StoreStatusFilter {
  return v !== undefined && (STORE_STATUSES as readonly string[]).includes(v)
}

export default async function StoresPage({
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
    { userId: session.user.id, reason: "admin list stores" },
    async (tx) => {
      const filters: SQL[] = []
      if (isStoreStatus(status)) filters.push(eq(schema.stores.status, status))
      if (q && q.trim()) {
        const like = `%${q.trim()}%`
        const search = or(
          ilike(schema.stores.name, like),
          ilike(schema.stores.slug, like),
          ilike(schema.users.email, like),
        )
        if (search) filters.push(search)
      }
      const orderBy =
        sortKey === "name"
          ? asc(schema.stores.name)
          : sortKey === "name_desc"
            ? desc(schema.stores.name)
            : sortKey === "status"
              ? asc(schema.stores.status)
              : sortKey === "status_desc"
                ? desc(schema.stores.status)
                : desc(schema.stores.createdAt)

      return tx
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          slug: schema.stores.slug,
          status: schema.stores.status,
          ownerEmail: schema.users.email,
          ownerName: schema.users.name,
          createdAt: schema.stores.createdAt,
        })
        .from(schema.stores)
        .innerJoin(schema.users, eq(schema.users.id, schema.stores.ownerId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(orderBy)
    },
  )

  const buildHref = (next: { status?: string; q?: string; sort?: string }) => {
    const params = new URLSearchParams()
    const s = next.status ?? (isStoreStatus(status) ? status : "")
    const query = next.q ?? q ?? ""
    const so = next.sort ?? sortKey
    if (s) params.set("status", s)
    if (query) params.set("q", query)
    if (so !== "created_desc") params.set("sort", so)
    const qs = params.toString()
    return qs ? `/stores?${qs}` : "/stores"
  }

  const toggle = (col: "name" | "status"): SortKey =>
    sortKey === col ? (`${col}_desc` as SortKey) : (col as SortKey)

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Stores</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 text-sm">
            {["", ...STORE_STATUSES].map((s) => (
              <Link
                key={s || "all"}
                href={buildHref({ status: s })}
                className={cn(
                  "rounded px-3 py-1",
                  (isStoreStatus(status) ? status : "") === s
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s || "All"}
              </Link>
            ))}
          </div>
          <form method="get" className="flex items-center gap-1">
            {isStoreStatus(status) && <input type="hidden" name="status" value={status} />}
            {sortKey !== "created_desc" && <input type="hidden" name="sort" value={sortKey} />}
            <label htmlFor="stores-search" className="sr-only">
              Search stores
            </label>
            <Input
              id="stores-search"
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
          <Button asChild>
            <Link href="/stores/new">+ Create Store</Link>
          </Button>
        </div>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">
                <Link href={buildHref({ sort: toggle("name") })} className="hover:text-foreground">
                  Store {sortKey === "name" ? "▴" : sortKey === "name_desc" ? "▾" : ""}
                </Link>
              </th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">
                <Link
                  href={buildHref({ sort: toggle("status") })}
                  className="hover:text-foreground"
                >
                  Status {sortKey === "status" ? "▴" : sortKey === "status_desc" ? "▾" : ""}
                </Link>
              </th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{row.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.slug}</div>
                  <CopyId id={row.id} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.ownerName ?? row.ownerEmail}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={STATUS_COLORS[row.status]}>
                    {row.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {row.status === "pending" && (
                    <form action={approveStore.bind(null, row.id)}>
                      <Button variant="link" type="submit" className="h-auto p-0">
                        Approve
                      </Button>
                    </form>
                  )}
                  {row.status === "active" && (
                    <form action={suspendStore.bind(null, row.id)}>
                      <Button variant="link" type="submit" className="h-auto p-0 text-destructive">
                        Suspend
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No stores found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
