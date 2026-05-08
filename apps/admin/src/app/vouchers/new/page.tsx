import { redirect } from "next/navigation"

import { auth } from "@/auth"
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
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Create Compensation Voucher</h1>
      <form
        action={async (formData) => {
          "use server"
          await createVoucher(formData)
          redirect("/vouchers")
        }}
        className="max-w-md space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">User Email</label>
          <input
            name="userEmail"
            type="email"
            required
            placeholder="buyer@example.com"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Voucher Code</label>
          <input
            name="code"
            type="text"
            required
            placeholder="COMP-XXXX"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Must be unique. Use COMP- prefix for compensation vouchers.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Amount (MYR)</label>
          <input
            name="fixedAmountMyr"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="10.00"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Issued Month</label>
          <input
            name="issuedMonth"
            type="month"
            required
            defaultValue={currentMonth}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Format YYYY-MM. One voucher per user per month.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Expires On</label>
          <input
            name="expiresAt"
            type="date"
            required
            defaultValue={defaultExpiry}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Voucher
          </button>
          <a
            href="/vouchers"
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
