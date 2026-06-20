export default function VerifyRequestPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <EnvelopeIcon />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Check your email</h1>
        <p className="mt-2 text-sm text-gray-500">
          A sign-in link has been sent to your email address. The link expires in 24 hours.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Didn&apos;t receive it? Check your spam folder, or{" "}
          <a href="/auth/sign-in" className="underline">
            try again
          </a>
          .
        </p>
      </div>
    </main>
  )
}

function EnvelopeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-gray-500"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 7 10-7" />
    </svg>
  )
}
