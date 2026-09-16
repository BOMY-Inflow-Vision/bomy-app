"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { useToast } from "@/components/toaster"
import type { ToastType } from "@/lib/flash-toast"

// Shows one toast when a server-rendered page arrives in a state worth announcing (e.g. ?error=).
// Optionally strips that query param so a refresh doesn't repeat the toast.
export function ToastOnMount({
  type,
  message,
  clearSearchParam,
}: {
  type: ToastType
  message: string
  clearSearchParam?: string
}) {
  const toast = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const shown = React.useRef(false)

  React.useEffect(() => {
    if (shown.current) return
    shown.current = true
    toast[type](message)
    if (clearSearchParam && searchParams.has(clearSearchParam)) {
      const next = new URLSearchParams(searchParams.toString())
      next.delete(clearSearchParam)
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }
  }, [toast, type, message, clearSearchParam, searchParams, router, pathname])

  return null
}
