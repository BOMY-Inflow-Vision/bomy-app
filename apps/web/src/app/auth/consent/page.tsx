import { redirect } from "next/navigation"

import { auth } from "@/auth"

import { ConsentActions } from "./consent-actions"

export default async function ConsentPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/sign-in")

  // Already consented to the current version — nothing to do
  if (
    session.user.consentVersion &&
    session.user.consentVersion === session.user.currentTosVersion
  ) {
    redirect("/")
  }

  const version = session.user.currentTosVersion ?? "current"

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted">
      <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Before you continue
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please review and accept our updated Terms of Service and Privacy Policy (version{" "}
            {version}) to use BOMY.
          </p>
        </div>

        <div className="mb-6 rounded-lg bg-muted p-4 text-sm text-foreground">
          <p>
            By clicking <strong>I Agree</strong>, you confirm you have read and accept our{" "}
            <a href="/terms" target="_blank" className="text-foreground underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" className="text-foreground underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        <ConsentActions />
      </div>
    </main>
  )
}
