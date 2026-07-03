import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createVoucher } from "../actions"

export default async function NewVoucherPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")

  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const defaultExpiry = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 3, 0)
    .toISOString()
    .split("T")[0]

  const currentMonth = new Date().toISOString().slice(0, 7)

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create Compensation Voucher</h1>
      <form
        action={async (formData) => {
          "use server"
          await createVoucher(formData)
          redirect("/vouchers")
        }}
        className="max-w-md space-y-4"
      >
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
          <Input
            id="expiresAt"
            name="expiresAt"
            type="date"
            required
            defaultValue={defaultExpiry}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit">Create Voucher</Button>
          <Button variant="outline" asChild>
            <a href="/vouchers">Cancel</a>
          </Button>
        </div>
      </form>
    </div>
  )
}
