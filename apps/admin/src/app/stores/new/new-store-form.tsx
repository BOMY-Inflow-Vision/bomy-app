"use client"

import { type FormEvent, useActionState, useEffect, useTransition } from "react"

import { useToast } from "@/components/toaster"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createStore, type CreateStoreResult } from "../actions"
import { StoreProvisioningFields } from "./store-provisioning-fields"

export function NewStoreForm() {
  const [state, dispatch] = useActionState<CreateStoreResult | null, FormData>(createStore, null)
  const [, startTransition] = useTransition()
  const toast = useToast()

  useEffect(() => {
    if (state && !state.ok) toast.error(state.error)
  }, [state, toast])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    // Dispatched manually rather than via <form action>: React 19 resets uncontrolled fields
    // after a form action completes even when it returns an error, wiping what the admin typed.
    startTransition(() => dispatch(formData))
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      {state && !state.ok && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      <div>
        <Label htmlFor="ownerEmail" className="mb-1 block">
          Owner Email *
        </Label>
        <Input
          id="ownerEmail"
          name="ownerEmail"
          type="email"
          required
          placeholder="seller@example.com"
        />
        <p className="mt-1 text-xs text-muted-foreground">User must already exist in the system</p>
      </div>
      <div>
        <Label htmlFor="name" className="mb-1 block">
          Store Name *
        </Label>
        <Input id="name" name="name" required placeholder="Kedai Maju" />
      </div>
      <div>
        <Label htmlFor="slug" className="mb-1 block">
          Slug *
        </Label>
        <Input
          id="slug"
          name="slug"
          required
          placeholder="kedai-maju"
          pattern="[a-z0-9-]{3,50}"
          title="Lowercase letters, numbers, hyphens only. 3–50 characters."
          className="font-mono"
        />
      </div>
      <div>
        <Label htmlFor="description" className="mb-1 block">
          Description (optional)
        </Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Brief description of the store"
        />
      </div>
      <StoreProvisioningFields />
    </form>
  )
}
