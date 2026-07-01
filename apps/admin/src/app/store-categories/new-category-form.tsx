"use client"

import { useRef, useState, useTransition } from "react"

import { createStoreCategory } from "./actions"

export function NewStoreCategoryForm() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLFormElement>(null)

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await createStoreCategory(formData)
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
      <label htmlFor="new-store-category-name" className="sr-only">
        New category name
      </label>
      <input
        id="new-store-category-name"
        name="name"
        required
        placeholder="Category name"
        className="rounded border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add Category"}
      </button>
      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}
