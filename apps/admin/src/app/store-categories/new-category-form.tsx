"use client"

import { useRef, useState, useTransition } from "react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createStoreCategory } from "./actions"

export function NewStoreCategoryForm() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLFormElement>(null)
  const toast = useToast()

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await createStoreCategory(formData)
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      setError(null)
      ref.current?.reset()
      toast.success("Store category created.")
    })
  }

  return (
    <form ref={ref} action={submit} className="flex items-center gap-2">
      <Label htmlFor="new-store-category-name" className="sr-only">
        New category name
      </Label>
      <Input
        id="new-store-category-name"
        name="name"
        required
        placeholder="Category name"
        className="w-48"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add Category"}
      </Button>
      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
