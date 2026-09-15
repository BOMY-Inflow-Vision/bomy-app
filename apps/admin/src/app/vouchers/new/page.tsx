import { requireAdmin } from "@/lib/auth"
import { NewVoucherForm } from "./new-voucher-form"

export default async function NewVoucherPage() {
  await requireAdmin()

  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const defaultExpiry = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 3, 0)
    .toISOString()
    .split("T")[0]

  const currentMonth = new Date().toISOString().slice(0, 7)

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create Compensation Voucher</h1>
      <NewVoucherForm currentMonth={currentMonth} defaultExpiry={defaultExpiry} />
    </div>
  )
}
