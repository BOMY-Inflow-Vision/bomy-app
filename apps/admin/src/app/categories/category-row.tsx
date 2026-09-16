"use client"

import { useState, useTransition } from "react"
import { CircleCheck, CircleX, Pencil, Save, Trash2, X } from "lucide-react"

import { useToast } from "@/components/toaster"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  const toast = useToast()

  function handleSave() {
    startTransition(async () => {
      const result = await updateCategory(cat.id, name, sortOrder)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      setError(null)
      setEditing(false)
      toast.success("Category updated.")
    })
  }

  function handleCancel() {
    setName(cat.name)
    setSortOrder(cat.sortOrder)
    setError(null)
    setEditing(false)
  }

  function handleToggle() {
    startTransition(async () => {
      const willBeActive = !cat.isActive
      const result = await toggleCategory(cat.id, willBeActive)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(willBeActive ? "Category activated." : "Category deactivated.")
    })
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${cat.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const result = await deleteCategory(cat.id)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success("Category deleted.")
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
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
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
            <Button size="sm" icon={<Save />} onClick={handleSave} disabled={isPending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<X />}
              arrowOnHover={false}
              onClick={handleCancel}
              disabled={isPending}
            >
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
        {error && <p className="mb-1 text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="link"
            size="sm"
            icon={<Pencil />}
            className="text-xs"
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
            icon={cat.isActive ? <CircleX /> : <CircleCheck />}
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={handleToggle}
            disabled={isPending}
          >
            {cat.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 />}
            className="text-xs text-destructive hover:text-destructive"
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
