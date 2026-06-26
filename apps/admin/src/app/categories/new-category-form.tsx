"use client"

import { useRef, useState, useTransition } from "react"

import { createCategory } from "./actions"

export function NewCategoryForm() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLFormElement>(null)

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await createCategory(formData)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError(null)
      ref.current?.reset()
    })
  }

  return (
    <form ref={ref} action={submit} className="flex items-center gap-2">
      <input
        name="name"
        required
        placeholder="Category name"
        className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add Category"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
