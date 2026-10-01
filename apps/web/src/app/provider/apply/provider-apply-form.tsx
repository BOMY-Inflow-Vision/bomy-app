"use client"

import * as React from "react"
import { type FormEvent, useActionState, useEffect, useState, useTransition } from "react"
import { Send } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@bomy/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { submitProviderApplication, type SubmitProviderApplicationResult } from "./actions"

export type ServiceCategoryOption = { id: string; name: string }

const OTHER_VALUE = "__other__"

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-destructive">
      {message}
    </p>
  )
}

async function formAction(
  _prev: SubmitProviderApplicationResult | null,
  formData: FormData,
): Promise<SubmitProviderApplicationResult> {
  try {
    return await submitProviderApplication(formData)
  } catch {
    return { ok: false, errors: { form: "We couldn't submit your application. Please try again." } }
  }
}

export function ProviderApplyForm({ categories }: { categories: ServiceCategoryOption[] }) {
  const [state, action, pending] = useActionState(formAction, null)
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [categoryChoice, setCategoryChoice] = useState<string>(categories[0]?.id ?? OTHER_VALUE)
  const isOther = categoryChoice === OTHER_VALUE

  useEffect(() => {
    if (!state) return
    if (state.ok) {
      toast.success("Application submitted — we'll be in touch soon.")
      return
    }
    if (state.errors.form) toast.error(state.errors.form)
  }, [state, toast])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("serviceCategoryId", isOther ? "" : categoryChoice)
    startTransition(() => action(formData))
  }

  if (state?.ok) {
    return (
      <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border text-center">
        <h1 className="text-lg font-semibold text-foreground">Application submitted!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Our team will review your application and contact you soon.
        </p>
      </div>
    )
  }

  const errors = state && !state.ok ? state.errors : undefined

  return (
    <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Become a Service Provider</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Offer your services to BOMY sellers. Fill in the form and our team will be in touch.
      </p>

      {errors?.form && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name" className="mb-1 block text-sm font-medium">
            Full Name *
          </Label>
          <Input
            id="name"
            name="name"
            required
            aria-invalid={errors?.name ? true : undefined}
            aria-describedby={errors?.name ? "name-error" : undefined}
          />
          <FieldError id="name-error" message={errors?.name} />
        </div>
        <div>
          <Label htmlFor="contactEmail" className="mb-1 block text-sm font-medium">
            Contact Email *
          </Label>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            aria-invalid={errors?.contactEmail ? true : undefined}
            aria-describedby={errors?.contactEmail ? "contactEmail-error" : undefined}
          />
          <FieldError id="contactEmail-error" message={errors?.contactEmail} />
        </div>
        <div>
          <Label htmlFor="contactNumber" className="mb-1 block text-sm font-medium">
            Contact Number *
          </Label>
          <Input
            id="contactNumber"
            name="contactNumber"
            type="tel"
            required
            placeholder="+60 12-345 6789"
            aria-invalid={errors?.contactNumber ? true : undefined}
            aria-describedby={errors?.contactNumber ? "contactNumber-error" : undefined}
          />
          <FieldError id="contactNumber-error" message={errors?.contactNumber} />
        </div>
        <div>
          <Label htmlFor="companyName" className="mb-1 block text-sm font-medium">
            Company Name *
          </Label>
          <Input
            id="companyName"
            name="companyName"
            required
            aria-invalid={errors?.companyName ? true : undefined}
            aria-describedby={errors?.companyName ? "companyName-error" : undefined}
          />
          <FieldError id="companyName-error" message={errors?.companyName} />
        </div>
        <div>
          <Label htmlFor="serviceCategoryChoice" className="mb-1 block text-sm font-medium">
            Service Category *
          </Label>
          <select
            id="serviceCategoryChoice"
            name="serviceCategoryChoice"
            required
            value={categoryChoice}
            onChange={(e) => setCategoryChoice(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            aria-invalid={errors?.serviceCategoryId ? true : undefined}
            aria-describedby={errors?.serviceCategoryId ? "serviceCategoryId-error" : undefined}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={OTHER_VALUE}>Other</option>
          </select>
          <FieldError id="serviceCategoryId-error" message={errors?.serviceCategoryId} />
        </div>
        <div>
          <Label htmlFor="businessDescription" className="mb-1 block text-sm font-medium">
            Describe your business{" "}
            {isOther ? "*" : <span className="text-muted-foreground font-normal">(optional)</span>}
          </Label>
          <Textarea
            id="businessDescription"
            name="businessDescription"
            rows={3}
            required={isOther}
            placeholder="Tell us about the services you offer..."
            aria-invalid={errors?.businessDescription ? true : undefined}
            aria-describedby={errors?.businessDescription ? "businessDescription-error" : undefined}
          />
          <FieldError id="businessDescription-error" message={errors?.businessDescription} />
        </div>

        <Button type="submit" icon={<Send />} disabled={pending} className="w-full">
          {pending ? "Submitting…" : "Submit Application"}
        </Button>
      </form>
    </div>
  )
}
