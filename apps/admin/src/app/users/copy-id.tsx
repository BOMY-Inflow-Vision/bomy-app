"use client"

import { useState } from "react"

export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      title={id}
      onClick={() => {
        void navigator.clipboard.writeText(id)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-gray-400 hover:text-gray-600"
    >
      <span>{id.slice(0, 8)}…</span>
      <span className="font-sans text-indigo-600">{copied ? "Copied!" : "Copy ID"}</span>
    </button>
  )
}
