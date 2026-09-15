import { signIn } from "@/auth"
import { Button } from "@/components/ui/button"
import { ToastOnMount } from "@/components/toast-on-mount"
import { authErrorMessage } from "@/lib/auth-error-messages"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const params = await searchParams
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error
  const errorMessage = authErrorMessage(rawError)

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-background p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Admin Sign In</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your BOMY Google account
          </p>
        </div>
        {errorMessage && (
          <>
            <p role="alert" className="mb-4 text-sm text-destructive">
              {errorMessage}
            </p>
            <ToastOnMount type="error" message={errorMessage} />
          </>
        )}
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/stores" })
          }}
        >
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
      </div>
    </div>
  )
}
