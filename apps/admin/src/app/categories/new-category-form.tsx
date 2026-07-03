"use client"

import { useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
      <Label htmlFor="new-category-name" className="sr-only">
        New category name
      </Label>
      <Input
        id="new-category-name"
        name="name"
        required
        placeholder="Category name"
        className="w-48"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add Category"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
