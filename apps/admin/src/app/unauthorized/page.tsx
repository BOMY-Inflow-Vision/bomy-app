import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account does not have admin access to BOMY.
        </p>
        <Button asChild variant="link" className="mt-4">
          <Link href="/auth/sign-in">Sign in with a different account</Link>
        </Button>
      </div>
    </main>
  )
}
