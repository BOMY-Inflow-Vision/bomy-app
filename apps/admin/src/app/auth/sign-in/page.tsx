import { signIn } from "@/auth"
import { Button } from "@/components/ui/button"

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-background p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Admin Sign In</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your BOMY Google account
          </p>
        </div>
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
    </main>
  )
}
