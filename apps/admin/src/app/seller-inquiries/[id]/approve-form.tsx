"use client"

import { useState, useTransition } from "react"

import { approveInquiry, rejectInquiry } from "../actions"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function ApproveForm({
  inquiryId,
  defaultSlug,
}: {
  inquiryId: string
  defaultSlug: string
}) {
  const [slug, setSlug] = useState(slugify(defaultSlug))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <label className="block text-sm font-medium text-gray-700">
        Store slug
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await approveInquiry(inquiryId, slug)
              if (!res.ok) setError(res.error)
            })
          }
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Working…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await rejectInquiry(inquiryId)
              if (!res.ok) setError(res.error)
            })
          }
          className="rounded border border-amber-300 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
