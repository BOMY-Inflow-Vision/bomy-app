import Link from "next/link"

export default function MembershipSuccessPage() {
  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-20 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
          <svg
            className="h-8 w-8 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">Payment received!</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Your BOMY membership is being activated. This usually takes a few seconds. You&apos;ll
          receive a confirmation email from HitPay shortly.
        </p>

        <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your Welcome Starter Kit will be dispatched within 14 days.
        </div>

        <Link
          href="/membership/manage"
          className="block w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700 transition-colors text-center"
        >
          View my membership
        </Link>

        <Link
          href="/"
          className="mt-3 block text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}
