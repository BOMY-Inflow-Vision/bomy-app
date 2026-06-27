"use client"

import { useState, useTransition } from "react"

import { deleteCategory, toggleCategory, updateCategory } from "./actions"

type Category = {
  id: string
  name: string
  slug: string
  sortOrder: number
  isActive: boolean
}

export function CategoryRow({ cat }: { cat: Category }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cat.name)
  const [sortOrder, setSortOrder] = useState(cat.sortOrder)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await updateCategory(cat.id, name, sortOrder)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setEditing(false)
    })
  }

  function handleCancel() {
    setName(cat.name)
    setSortOrder(cat.sortOrder)
    setError(null)
    setEditing(false)
  }

  function handleToggle() {
    startTransition(() => toggleCategory(cat.id, !cat.isActive))
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${cat.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const result = await deleteCategory(cat.id)
      if (!result.ok) setError(result.error)
    })
  }

  const statusBadge = (
    <span
      className={
        cat.isActive
          ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
      }
    >
      {cat.isActive ? "Active" : "Inactive"}
    </span>
  )

  if (editing) {
    return (
      <tr className={cat.isActive ? "" : "opacity-50"}>
        <td className="px-4 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-gray-500">{cat.slug}</td>
        <td className="px-4 py-2">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">{statusBadge}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={cat.isActive ? "" : "opacity-50"}>
      <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500">{cat.slug}</td>
      <td className="px-4 py-3 text-gray-500">{cat.sortOrder}</td>
      <td className="px-4 py-3">{statusBadge}</td>
      <td className="px-4 py-3 text-right">
        {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => {
              setError(null)
              setEditing(true)
            }}
            disabled={isPending}
            className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
          >
            Edit
          </button>
          <button
            onClick={handleToggle}
            disabled={isPending}
            className="text-xs text-gray-500 hover:underline disabled:opacity-50"
          >
            {cat.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs text-red-500 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}
