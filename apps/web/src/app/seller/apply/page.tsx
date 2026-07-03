"use client"

import Script from "next/script"
import { useActionState, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { submitSellerInquiry } from "./actions"

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          "expired-callback"?: () => void
          "error-callback"?: () => void
          theme?: "light" | "dark" | "auto"
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const SITEKEY = process.env["NEXT_PUBLIC_TURNSTILE_SITEKEY"] ?? ""

const INITIAL_STATE = { success: false, error: "" }

function formAction(
  _prev: typeof INITIAL_STATE,
  formData: FormData,
): Promise<typeof INITIAL_STATE> {
  return submitSellerInquiry(formData)
    .then(() => ({ success: true, error: "" }))
    .catch((e: Error) => ({ success: false, error: e.message }))
}

export default function SellerApplyPage() {
  const [state, action, pending] = useActionState(formAction, INITIAL_STATE)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [token, setToken] = useState("")
  const [scriptReady, setScriptReady] = useState(false)

  // Render the widget once the script is ready AND the container is in the DOM.
  useEffect(() => {
    if (!scriptReady || !containerRef.current || widgetIdRef.current) return
    if (!SITEKEY) return
    if (!window.turnstile) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITEKEY,
      callback: (t) => setToken(t),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    })
  }, [scriptReady])

  // Reset the widget on ANY action failure.
  // Depend on `state` (the whole object), not `state.error` — useActionState
  // returns a fresh object reference per invocation, but the error string can
  // be value-equal across consecutive failures (e.g. two verify rejections
  // both produce "Verification failed..."). [state.error] would not re-fire;
  // [state] does because the reference changes each time.
  useEffect(() => {
    if (state.error && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
      setToken("")
    }
  }, [state])

  // Cleanup on unmount — avoids duplicate widgets if the page remounts.
  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [])

  if (state.success) {
    return (
      <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
        <div className="w-full max-w-md rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h1 className="text-lg font-semibold text-foreground">Application Submitted!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Our team will review your application and contact you within 3–5 business days.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
      {/* Scoped to the form branch: the state.success early-return above unmounts
          this, so a back-nav to the form re-fetches the script. Harmless — the
          render effect's widgetIdRef guard prevents a duplicate widget. */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />

      <div className="w-full max-w-md rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Become a Seller</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Interested in selling on BOMY? Fill in the form and our team will be in touch.
        </p>

        {state.error && (
          <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="name" className="mb-1 block text-sm font-medium">
              Full Name *
            </Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email *
            </Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="contactNumber" className="mb-1 block text-sm font-medium">
              Contact Number *
            </Label>
            <Input
              id="contactNumber"
              name="contactNumber"
              type="tel"
              required
              placeholder="+60 12-345 6789"
            />
          </div>
          <div>
            <Label htmlFor="companyName" className="mb-1 block text-sm font-medium">
              Company Name *
            </Label>
            <Input id="companyName" name="companyName" required />
          </div>
          <div>
            <Label htmlFor="storeName" className="mb-1 block text-sm font-medium">
              Store Name *
            </Label>
            <Input id="storeName" name="storeName" required />
          </div>
          <div>
            <Label htmlFor="message" className="mb-1 block text-sm font-medium">
              Message <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="message"
              name="message"
              rows={3}
              placeholder="Tell us a bit about your products..."
            />
          </div>

          {/* Turnstile widget container + hidden token mirror for FormData. */}
          <div ref={containerRef} />
          <input type="hidden" name="cf-turnstile-response" value={token} />

          {!SITEKEY && (
            <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Form temporarily unavailable. Please try again later.
            </div>
          )}

          <Button type="submit" disabled={pending || !token || !SITEKEY} className="w-full">
            {pending ? "Submitting…" : "Submit Application"}
          </Button>
        </form>
      </div>
    </main>
  )
}
