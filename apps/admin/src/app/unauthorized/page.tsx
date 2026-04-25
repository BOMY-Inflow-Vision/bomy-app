import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Access Denied</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your account does not have admin access to BOMY.
        </p>
        <Link
          href="/auth/sign-in"
          className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
        >
          Sign in with a different account
        </Link>
      </div>
    </main>
  )
}
