"use client"

import Script from "next/script"
import { useActionState, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { sendMagicLinkAction } from "./actions"

// Extend Window to include the Turnstile API (mirrors seller/apply/page.tsx).
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

export function MagicLinkForm() {
  const [state, action, pending] = useActionState(sendMagicLinkAction, null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [token, setToken] = useState("")
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    if (!scriptReady || !containerRef.current || widgetIdRef.current) return
    if (!SITEKEY || !window.turnstile) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITEKEY,
      callback: (t) => setToken(t),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    })
  }, [scriptReady])

  // Reset widget on any action response (only errors return state; success redirects).
  useEffect(() => {
    if (state && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
      setToken("")
    }
  }, [state])

  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />

      <form action={action} className="flex flex-col gap-2">
        {state?.error && (
          <div className={cn("rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive")}>
            {state.error}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input type="email" id="email" name="email" placeholder="you@example.com" required />
        </div>
        <input type="hidden" name="cf-turnstile-response" value={token} />
        <div ref={containerRef} className="flex justify-center" />
        {!SITEKEY && (
          <p className="text-center text-xs text-muted-foreground">
            Sign-in temporarily unavailable.
          </p>
        )}
        <Button type="submit" disabled={pending || !token || !SITEKEY} className="w-full">
          {pending ? "Sending…" : "Send magic link"}
        </Button>
      </form>
    </>
  )
}
