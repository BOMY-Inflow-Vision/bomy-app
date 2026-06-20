"use client"

import Script from "next/script"
import { useActionState, useEffect, useRef, useState } from "react"

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
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
        )}
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
        <input type="hidden" name="cf-turnstile-response" value={token} />
        <div ref={containerRef} className="flex justify-center" />
        {!SITEKEY && (
          <p className="text-center text-xs text-gray-400">Sign-in temporarily unavailable.</p>
        )}
        <button
          type="submit"
          disabled={pending || !token || !SITEKEY}
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </>
  )
}
