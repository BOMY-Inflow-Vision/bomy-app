import Link from "next/link"
import { Mail } from "lucide-react"

import { Card, CardContent } from "@bomy/ui/card"

export default function VerifyRequestPage() {
  return (
    <main className="flex min-h-[calc(100dvh-var(--nav-height)-var(--nav-offset))] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm !rounded-bento bg-card text-center">
        <CardContent className="p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Mail aria-hidden="true" className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A sign-in link has been sent to your email address. The link expires in 24 hours.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Didn&apos;t receive it? Check your spam folder, or{" "}
            <Link
              href="/auth/sign-in"
              className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              try again
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
