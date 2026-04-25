import { signIn } from "@/auth"

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">BOMY Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in with your BOMY Google account</p>
        </div>
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/stores" })
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  )
}
