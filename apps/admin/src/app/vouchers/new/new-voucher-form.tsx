"use client"

import { type FormEvent, useActionState, useEffect, useTransition } from "react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createVoucher, type CreateVoucherResult } from "../actions"

interface Props {
  currentMonth: string
  defaultExpiry: string | undefined
}

export function NewVoucherForm({ currentMonth, defaultExpiry }: Props) {
  const [state, dispatch] = useActionState<CreateVoucherResult | null, FormData>(
    createVoucher,
    null,
  )
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
      <div className="space-y-1.5">
        <Label htmlFor="userEmail">User Email</Label>
        <Input
          id="userEmail"
          name="userEmail"
          type="email"
          required
          placeholder="buyer@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Voucher Code</Label>
        <Input
          id="code"
          name="code"
          type="text"
          required
          placeholder="COMP-XXXX"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Must be unique. Use COMP- prefix for compensation vouchers.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fixedAmountMyr">Amount (MYR)</Label>
        <Input
          id="fixedAmountMyr"
          name="fixedAmountMyr"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="10.00"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="issuedMonth">Issued Month</Label>
        <Input
          id="issuedMonth"
          name="issuedMonth"
          type="month"
          required
          defaultValue={currentMonth}
        />
        <p className="text-xs text-muted-foreground">
          Format YYYY-MM. One voucher per user per month.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expiresAt">Expires On</Label>
        <Input id="expiresAt" name="expiresAt" type="date" required defaultValue={defaultExpiry} />
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="submit">Create Voucher</Button>
        <Button variant="outline" asChild>
          <a href="/vouchers">Cancel</a>
        </Button>
      </div>
    </form>
  )
}
