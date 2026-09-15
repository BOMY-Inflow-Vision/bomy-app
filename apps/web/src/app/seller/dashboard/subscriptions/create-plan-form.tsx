"use client"

import { type FormEvent, useTransition } from "react"
import { Plus } from "lucide-react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { createPlan } from "./actions"

const TERM_LABELS: Record<number, string> = {
  3: "3 months",
  6: "6 months",
  12: "12 months",
}

export function CreatePlanForm({ availableTerms }: { availableTerms: number[] }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  // Submitted via onSubmit/startTransition rather than <form action> so React 19
  // doesn't reset the (uncontrolled) fields when createPlan returns an error —
  // see seller/apply/page.tsx for the same pattern.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await createPlan(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Plan created — pending BOMY activation")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <Label
          htmlFor="termMonths"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Term length
        </Label>
        <select
          id="termMonths"
          name="termMonths"
          required
          className="rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Select term</option>
          {availableTerms.map((t) => (
            <option key={t} value={t}>
              {TERM_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label
          htmlFor="priceMyrSen"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Price (RM)
        </Label>
        <Input
          id="priceMyrSen"
          name="priceMyrSen"
          placeholder="e.g. 50.00"
          required
          className="w-28"
        />
      </div>
      <div>
        <Label
          htmlFor="discountPct"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Buyer discount (%)
        </Label>
        <select
          id="discountPct"
          name="discountPct"
          required
          className="rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Select %</option>
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <Label
          htmlFor="description"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Description (optional)
        </Label>
        <Input id="description" name="description" placeholder="Describe subscriber benefits" />
      </div>
      <Button type="submit" icon={<Plus />} disabled={pending}>
        {pending ? "Creating…" : "Create Plan"}
      </Button>
    </form>
  )
}
