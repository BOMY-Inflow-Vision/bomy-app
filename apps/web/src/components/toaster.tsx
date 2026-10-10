"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { CircleAlert, CircleCheck, CircleX, Info, X } from "lucide-react"

import {
  FLASH_TOAST_COOKIE,
  parseFlashToast,
  readCookieValue,
  type ToastType,
} from "@/lib/flash-toast"
import { cn } from "@/lib/utils"

export type { ToastType }

export interface ToastItem {
  id: number
  type: ToastType
  message: string
  leaving: boolean
  bump: number
}

type ToastAction =
  | { type: "add"; toast: Pick<ToastItem, "id" | "type" | "message"> }
  | { type: "dismiss"; id: number }
  | { type: "remove"; id: number }

export const MAX_TOASTS = 3
const DURATION_MS = 3000
// toast-out (150ms) followed by the delayed 150ms row collapse below.
const EXIT_MS = 300

export function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case "add": {
      const { id, type, message } = action.toast
      const duplicate = state.find((t) => !t.leaving && t.type === type && t.message === message)
      if (duplicate) {
        return state.map((t) => (t === duplicate ? { ...t, bump: t.bump + 1 } : t))
      }
      const next = [...state, { id, type, message, leaving: false, bump: 0 }]
      const active = next.filter((t) => !t.leaving)
      const overflow = new Set(
        active.slice(0, Math.max(0, active.length - MAX_TOASTS)).map((t) => t.id),
      )
      return next.map((t) => (overflow.has(t.id) ? { ...t, leaving: true } : t))
    }
    case "dismiss":
      return state.map((t) => (t.id === action.id ? { ...t, leaving: true } : t))
    case "remove":
      return state.filter((t) => t.id !== action.id)
  }
}

const TOAST_STYLES: Record<
  ToastType,
  { icon: React.ReactNode; className: string; srLabel?: string }
> = {
  // Banners use the status tokens, so text and icon flip with the theme and every pair passes
  // 4.5:1 on its own tint (pinned in tests/design-tokens). The error banner sits on the opaque
  // card colour, not a translucent destructive tint: a floating toast can land over the navy admin
  // top bar, where 10% red lets the bar show through and drops the text to 2.7:1.
  success: {
    icon: <CircleCheck className="size-5 text-success" aria-hidden="true" />,
    className: "border-success/30 bg-success-subtle text-success",
  },
  info: {
    icon: <Info className="size-5 text-info" aria-hidden="true" />,
    className: "border-info/30 bg-info-subtle text-info",
  },
  warning: {
    icon: <CircleAlert className="size-5 text-warning" aria-hidden="true" />,
    className: "border-warning/30 bg-warning-subtle text-warning",
    srLabel: "Warning",
  },
  error: {
    icon: <CircleX className="size-5 text-destructive" aria-hidden="true" />,
    className: "border-destructive/30 bg-card text-destructive",
    srLabel: "Error",
  },
}

type ToastApi = Record<ToastType, (message: string) => void>

const ToastContext = React.createContext<ToastApi | null>(null)

export function ToastProvider({
  children,
  flash = null,
}: {
  children: React.ReactNode
  // Server-read flash cookie; a new value after a Server Action re-render re-runs the listener.
  flash?: string | null
}) {
  const [toasts, dispatch] = React.useReducer(toastReducer, [])
  const nextId = React.useRef(0)

  const api = React.useMemo<ToastApi>(() => {
    const show = (type: ToastType) => (message: string) => {
      nextId.current += 1
      dispatch({ type: "add", toast: { id: nextId.current, type, message } })
    }
    return {
      success: show("success"),
      info: show("info"),
      warning: show("warning"),
      error: show("error"),
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <FlashToastListener flash={flash} toast={api} />
      {/* Live region stays mounted so screen readers announce toasts added later. */}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-relevant="additions text"
        className="pointer-events-none fixed inset-x-4 top-[4.5rem] z-[60] sm:left-auto sm:w-80"
      >
        <ol className="flex flex-col">
          {toasts.map((toast) => (
            <ToastRow key={toast.id} toast={toast} dispatch={dispatch} />
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  )
}

function FlashToastListener({ flash, toast }: { flash: string | null; toast: ToastApi }) {
  const pathname = usePathname()

  React.useEffect(() => {
    const raw = readCookieValue(document.cookie, FLASH_TOAST_COOKIE)
    if (!raw) return
    document.cookie = `${FLASH_TOAST_COOKIE}=; Max-Age=0; Path=/`
    const parsed = parseFlashToast(raw)
    if (parsed) toast[parsed.type](parsed.message)
  }, [flash, pathname, toast])

  return null
}

function ToastRow({
  toast,
  dispatch,
}: {
  toast: ToastItem
  dispatch: React.Dispatch<ToastAction>
}) {
  const [paused, setPaused] = React.useState(false)
  const { id, leaving, bump } = toast
  const style = TOAST_STYLES[toast.type]

  React.useEffect(() => {
    if (leaving) {
      const timer = setTimeout(() => dispatch({ type: "remove", id }), EXIT_MS)
      return () => clearTimeout(timer)
    }
    if (paused) return
    const timer = setTimeout(() => dispatch({ type: "dismiss", id }), DURATION_MS)
    return () => clearTimeout(timer)
  }, [id, leaving, paused, bump, dispatch])

  return (
    <li
      className={cn(
        "grid grid-rows-[1fr] transition-[grid-template-rows] duration-150 motion-reduce:transition-none",
        leaving && "grid-rows-[0fr] delay-150",
      )}
    >
      <div className={cn("min-h-0", leaving && "overflow-y-clip")}>
        <div className="pb-2">
          <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className={cn(
              "pointer-events-auto flex animate-toast-in items-center gap-3 rounded-lg border p-4 shadow-lg motion-reduce:animate-none",
              style.className,
              leaving && "animate-toast-out",
            )}
          >
            <span className="shrink-0">{style.icon}</span>
            <p className="flex-1 text-sm">
              {style.srLabel && <span className="sr-only">{style.srLabel}: </span>}
              {toast.message}
            </p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dispatch({ type: "dismiss", id })}
              className="shrink-0 cursor-pointer rounded-full p-1 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside ToastProvider")
  return ctx
}
