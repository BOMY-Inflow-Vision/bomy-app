import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"

import { schema, withAdmin } from "@bomy/db"

import { getDb } from "@/lib/db"

import { ResolveForm } from "./_resolve-form"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

const REASON_COPY: Record<string, string> = {
  amount_mismatch:
    "No orders or ledger entries were created. Resolve after external manual reconciliation.",
  invalid_commission_config:
    "No orders or ledger entries were created. Resolve after external manual reconciliation.",
  voucher_claim_failed:
    "Orders and ledger are committed. Resolve after manually handling the voucher issue.",
}

interface Props {
  params: Promise<{ sessionId: string }>
}

export default async function CheckoutSessionReviewPage({ params }: Props) {
  const { sessionId } = await params

  const [session] = await withAdmin(
    getDb(),
    { userId: SYSTEM_ACTOR, reason: "admin view checkout session" },
    async (tx) =>
      tx
        .select({
          id: schema.checkoutSessions.id,
          status: schema.checkoutSessions.status,
          updatedAt: schema.checkoutSessions.updatedAt,
          paymentReviewReason: schema.checkoutSessions.paymentReviewReason,
          resolutionNote: schema.checkoutSessions.resolutionNote,
          resolvedBy: schema.checkoutSessions.resolvedBy,
          resolvedAt: schema.checkoutSessions.resolvedAt,
        })
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.id, sessionId))
        .limit(1),
  )

  if (!session) notFound()

  const reasonCopy = session.paymentReviewReason
    ? (REASON_COPY[session.paymentReviewReason] ?? "Resolve after investigation.")
    : null

  const isPending = session.status === "payment_review_required"

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <a href="/orders" className="mb-6 block text-sm text-indigo-600 hover:underline">
        ← Back to orders
      </a>

      <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment Review</h1>
      <p className="mb-6 text-sm text-gray-400 font-mono">{session.id}</p>

      <div className="mb-6 space-y-2 text-sm text-gray-700">
        <p>
          <span className="font-medium">Status:</span>{" "}
          <span className="capitalize">{session.status.replace(/_/g, " ")}</span>
        </p>
        <p>
          <span className="font-medium">Last updated:</span>{" "}
          {session.updatedAt.toLocaleString("en-MY")}
        </p>
        {session.paymentReviewReason && (
          <p>
            <span className="font-medium">Review reason:</span>{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">{session.paymentReviewReason}</code>
          </p>
        )}
        {reasonCopy && (
          <p className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-yellow-800">
            {reasonCopy}
          </p>
        )}
      </div>

      {session.resolvedBy && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-800">
          <p className="font-semibold mb-1">Resolved</p>
          <p>{session.resolutionNote}</p>
          <p className="mt-2 text-xs text-green-600">
            {session.resolvedAt?.toLocaleString("en-MY")} by {session.resolvedBy.slice(0, 8)}…
          </p>
        </div>
      )}

      {isPending && <ResolveForm sessionId={session.id} />}
    </main>
  )
}
