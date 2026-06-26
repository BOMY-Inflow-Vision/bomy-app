import Link from "next/link"
import { eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { notFound } from "next/navigation"

import { schema, withAdmin, type InquiryStatus } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { ApproveForm } from "./approve-form"

const STATUS_COLORS: Record<InquiryStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
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
      <Link href="/seller-inquiries" className="mb-6 block text-sm text-indigo-600 hover:underline">
        ← Back to inquiries
      </Link>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{row.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}
        >
          {row.status}
        </span>
      </div>

      <dl className="mb-6 grid grid-cols-3 gap-y-2 text-sm">
        <dt className="text-gray-500">Email</dt>
        <dd className="col-span-2 text-gray-800">{row.email}</dd>
        <dt className="text-gray-500">Contact</dt>
        <dd className="col-span-2 text-gray-800">{row.contactNumber}</dd>
        <dt className="text-gray-500">Company</dt>
        <dd className="col-span-2 text-gray-800">{row.companyName}</dd>
        <dt className="text-gray-500">Store name</dt>
        <dd className="col-span-2 text-gray-800">{row.storeName}</dd>
        <dt className="text-gray-500">Message</dt>
        <dd className="col-span-2 text-gray-800">{row.message ?? "—"}</dd>
        <dt className="text-gray-500">Submitted</dt>
        <dd className="col-span-2 text-gray-800">{row.createdAt.toLocaleString()}</dd>
        <dt className="text-gray-500">Reviewed at</dt>
        <dd className="col-span-2 text-gray-800">
          {row.reviewedAt ? row.reviewedAt.toLocaleString() : "—"}
        </dd>
        <dt className="text-gray-500">Reviewed by</dt>
        <dd className="col-span-2 text-gray-800">{row.reviewerName ?? row.reviewerEmail ?? "—"}</dd>
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Rejected{row.reviewedAt ? ` on ${row.reviewedAt.toLocaleString()}` : ""}
          {row.reviewerName ? ` by ${row.reviewerName}` : ""}.
        </div>
      )}
    </main>
  )
}
