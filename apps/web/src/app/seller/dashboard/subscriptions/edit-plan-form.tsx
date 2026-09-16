"use client"

import { type FormEvent, useTransition } from "react"
import { Save } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

import { updatePlan } from "./actions"

const DISCOUNT_OPTIONS = [5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `${n}%` }))

export function EditPlanForm({
  planId,
  defaultPriceMyr,
  defaultDiscountPct,
  defaultDescription,
}: {
  planId: string
  defaultPriceMyr: string
  defaultDiscountPct: number
  defaultDescription: string
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  // Submitted via onSubmit/startTransition rather than <form action> so React 19
  // doesn't reset the (uncontrolled) fields when updatePlan returns an error —
  // see seller/apply/page.tsx for the same pattern.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await updatePlan(planId, formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Plan updated — deactivated pending BOMY re-approval")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <Label
          htmlFor={`price_${planId}`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Price (RM)
        </Label>
        <Input
          id={`price_${planId}`}
          name="priceMyrSen"
          defaultValue={defaultPriceMyr}
          required
          className="w-28"
        />
      </div>
      <div>
        <Label
          htmlFor={`discount_${planId}`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Discount (%)
        </Label>
        <Select
          id={`discount_${planId}`}
          name="discountPct"
          defaultValue={String(defaultDiscountPct)}
          options={DISCOUNT_OPTIONS}
        />
      </div>
      <div className="flex-1">
        <Label
          htmlFor={`desc_${planId}`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Description (optional)
        </Label>
        <Input id={`desc_${planId}`} name="description" defaultValue={defaultDescription} />
      </div>
      <Button type="submit" size="sm" icon={<Save />} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  )
}
