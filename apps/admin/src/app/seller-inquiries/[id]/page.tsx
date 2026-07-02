import Link from "next/link"
import { eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { notFound } from "next/navigation"

import { schema, withAdmin, type InquiryStatus } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { ApproveForm } from "./approve-form"

const STATUS_COLORS: Record<InquiryStatus, string> = {
  pending: "bg-amber-100 text-amber-700 border-transparent",
  approved: "bg-green-100 text-green-700 border-transparent",
  rejected: "bg-red-100 text-red-700 border-transparent",
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function SellerInquiryDetailPage({ params }: Props) {
  const session = await auth()
  if (!session) return null
  const { id } = await params

  const reviewer = alias(schema.users, "reviewer")
  const [row] = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin view seller inquiry" },
    async (tx) =>
      tx
        .select({
          id: schema.sellerInquiries.id,
          name: schema.sellerInquiries.name,
          email: schema.sellerInquiries.email,
          contactNumber: schema.sellerInquiries.contactNumber,
          companyName: schema.sellerInquiries.companyName,
          storeName: schema.sellerInquiries.storeName,
          message: schema.sellerInquiries.message,
          status: schema.sellerInquiries.status,
          reviewedAt: schema.sellerInquiries.reviewedAt,
          createdAt: schema.sellerInquiries.createdAt,
          reviewerName: reviewer.name,
          reviewerEmail: reviewer.email,
          storeIdLinked: schema.stores.id,
          storeNameLinked: schema.stores.name,
          storeSlugLinked: schema.stores.slug,
          storeStatusLinked: schema.stores.status,
        })
        .from(schema.sellerInquiries)
        .leftJoin(reviewer, eq(reviewer.id, schema.sellerInquiries.reviewedBy))
        .leftJoin(schema.stores, eq(schema.stores.id, schema.sellerInquiries.storeId))
        .where(eq(schema.sellerInquiries.id, id))
        .limit(1),
  )

  if (!row) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/seller-inquiries" className="mb-6 block text-sm text-primary hover:underline">
        ← Back to inquiries
      </Link>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">{row.name}</h1>
        <Badge variant="outline" className={STATUS_COLORS[row.status]}>
          {row.status}
        </Badge>
      </div>

      <dl className="mb-6 grid grid-cols-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="col-span-2 text-foreground">{row.email}</dd>
        <dt className="text-muted-foreground">Contact</dt>
        <dd className="col-span-2 text-foreground">{row.contactNumber}</dd>
        <dt className="text-muted-foreground">Company</dt>
        <dd className="col-span-2 text-foreground">{row.companyName}</dd>
        <dt className="text-muted-foreground">Store name</dt>
        <dd className="col-span-2 text-foreground">{row.storeName}</dd>
        <dt className="text-muted-foreground">Message</dt>
        <dd className="col-span-2 text-foreground">{row.message ?? "—"}</dd>
        <dt className="text-muted-foreground">Submitted</dt>
        <dd className="col-span-2 text-foreground">{row.createdAt.toLocaleString()}</dd>
        <dt className="text-muted-foreground">Reviewed at</dt>
        <dd className="col-span-2 text-foreground">
          {row.reviewedAt ? row.reviewedAt.toLocaleString() : "—"}
        </dd>
        <dt className="text-muted-foreground">Reviewed by</dt>
        <dd className="col-span-2 text-foreground">
          {row.reviewerName ?? row.reviewerEmail ?? "—"}
        </dd>
      </dl>

      {row.status === "pending" && <ApproveForm inquiryId={row.id} defaultSlug={row.storeName} />}

      {row.status === "approved" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">Approved — pending store provisioned</p>
          <p className="mt-1">
            Store <span className="font-mono">{row.storeNameLinked ?? "—"}</span> (status:{" "}
            {row.storeStatusLinked ?? "—"}). Promote it to live on the{" "}
            <Link href="/stores" className="underline">
              Stores
            </Link>{" "}
            page.
          </p>
        </div>
      )}

      {row.status === "rejected" && (
        <div className="rounded-lg border border-red-200 bg-destructive/10 p-4 text-sm text-destructive">
          Rejected{row.reviewedAt ? ` on ${row.reviewedAt.toLocaleString()}` : ""}
          {row.reviewerName ? ` by ${row.reviewerName}` : ""}.
        </div>
      )}
    </main>
  )
}
