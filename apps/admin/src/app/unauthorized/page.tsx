import Link from "next/link"
import { LogIn } from "lucide-react"

import { ToastOnMount } from "@/components/toast-on-mount"
import { Button } from "@/components/ui/button"

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <ToastOnMount type="error" message="Your account doesn't have admin access to BOMY." />
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account does not have admin access to BOMY.
        </p>
        <Button asChild variant="link" icon={<LogIn />} className="mt-4">
          <Link href="/auth/sign-in">Sign in with a different account</Link>
        </Button>
      </div>
    </div>
  )
}
