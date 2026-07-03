"use client"

import { useState, useTransition } from "react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteStoreCategory, toggleStoreCategory, updateStoreCategory } from "./actions"

type StoreCategory = {
  id: string
  name: string
  slug: string
  sortOrder: number
  isActive: boolean
}

export function StoreCategoryRow({ cat }: { cat: StoreCategory }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cat.name)
  const [sortOrder, setSortOrder] = useState(cat.sortOrder)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await updateStoreCategory(cat.id, name, sortOrder)
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
    startTransition(() => toggleStoreCategory(cat.id, !cat.isActive))
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${cat.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const result = await deleteStoreCategory(cat.id)
      if (!result.ok) setError(result.error)
    })
  }

  const statusBadge = (
    <Badge
      variant={cat.isActive ? "secondary" : "outline"}
      className={cn(
        cat.isActive
          ? "border-transparent bg-green-100 text-green-700"
          : "border-transparent bg-muted text-muted-foreground",
      )}
    >
      {cat.isActive ? "Active" : "Inactive"}
    </Badge>
  )

  if (editing) {
    return (
      <tr className={cn(!cat.isActive && "opacity-50")}>
        <td className="px-4 py-2">
          <Label htmlFor={`cat-name-${cat.id}`} className="sr-only">
            Category name
          </Label>
          <Input
            id={`cat-name-${cat.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
            autoFocus
          />
          {error && (
            <p role="alert" aria-live="assertive" className="mt-1 text-xs text-destructive">
              {error}
            </p>
          )}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cat.slug}</td>
        <td className="px-4 py-2">
          <Label htmlFor={`cat-sort-${cat.id}`} className="sr-only">
            Sort order
          </Label>
          <Input
            id={`cat-sort-${cat.id}`}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-20"
          />
        </td>
        <td className="px-4 py-3">{statusBadge}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={cn(!cat.isActive && "opacity-50")}>
      <td className="px-4 py-3 font-medium text-foreground">{cat.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cat.slug}</td>
      <td className="px-4 py-3 text-muted-foreground">{cat.sortOrder}</td>
      <td className="px-4 py-3">{statusBadge}</td>
      <td className="px-4 py-3 text-right">
        {error && (
          <p role="alert" aria-live="assertive" className="mb-1 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => {
              setError(null)
              setEditing(true)
            }}
            disabled={isPending}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleToggle}
            disabled={isPending}
          >
            {cat.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  )
}
