"use client"

import { useState } from "react"

export function CopyStoreId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-sm text-gray-500">{id}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(id)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="text-xs font-medium text-indigo-600 hover:underline"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </span>
  )
}
