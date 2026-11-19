import { requireAdmin } from "@/lib/auth"
import { PageFrame } from "@/components/admin-ui/page-frame"
import { PageHeader } from "@/components/admin-ui/page-header"
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
    <PageFrame width="narrow">
      <PageHeader title="Create Compensation Voucher" />
      <NewVoucherForm currentMonth={currentMonth} defaultExpiry={defaultExpiry} />
    </PageFrame>
  )
}
