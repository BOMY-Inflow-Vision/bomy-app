import { sql } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { deleteInquiry } from "./actions"

export default async function SellerInquiriesPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin list inquiries" },
    async (tx) =>
      tx
        .select()
        .from(schema.sellerInquiries)
        .orderBy(sql`${schema.sellerInquiries.createdAt} desc`),
  )

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">
        Seller Inquiries
        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-sm font-normal text-gray-500">
          {rows.length}
        </span>
      </h1>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{row.name}</span>
                  <span className="text-sm text-gray-500">{row.email}</span>
                  <span className="text-sm text-gray-500">{row.contactNumber}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Company:</span> {row.companyName} &middot;{" "}
                  <span className="font-medium">Store:</span> {row.storeName}
                </div>
                {row.message && <div className="text-sm text-gray-500">{row.message}</div>}
                <div className="text-xs text-gray-400">{row.createdAt.toLocaleString()}</div>
              </div>
              <form action={deleteInquiry.bind(null, row.id)}>
                <button type="submit" className="text-sm text-red-500 hover:underline">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-12 text-center text-gray-400">No inquiries yet.</div>
        )}
      </div>
    </div>
  )
}
