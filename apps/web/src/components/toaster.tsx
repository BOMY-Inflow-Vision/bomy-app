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
import { Alert, type AlertProps } from "@bomy/ui/alert"
import { Button } from "@bomy/ui/button"

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

// Stack look (the Base UI / shadcn toast, flipped to grow downward from the top-right corner):
// the newest toast sits in front; each older one is 10 % smaller and peeks 12 px out below it.
// Hovering or focusing the stack spreads the toasts out with a 8 px gap and pauses every timer.
const PEEK_PX = 12
const GAP_PX = 8
const SCALE_STEP = 0.1

export interface StackLayout {
  // Position of each toast, keyed by id: its offset from the top of the stack and its scale.
  items: Map<number, { y: number; scale: number; behind: boolean }>
  // Height of the whole stack, so the hover area covers every toast.
  height: number
}

// Newest toast = index 0. `heights` holds each toast's natural height in px (0 until measured).
export function stackLayout(
  toasts: ToastItem[],
  heights: Record<number, number>,
  expanded: boolean,
): StackLayout {
  const newestFirst = [...toasts].reverse()
  const items: StackLayout["items"] = new Map()
  const front = newestFirst[0] ? (heights[newestFirst[0].id] ?? 0) : 0
  let spread = 0
  newestFirst.forEach((t, index) => {
    const h = heights[t.id] ?? 0
    if (expanded) {
      items.set(t.id, { y: spread, scale: 1, behind: false })
      spread += h + GAP_PX
    } else {
      const scale = Math.max(0, 1 - index * SCALE_STEP)
      // Origin is the top edge, so a scaled toast is moved down until its bottom edge sits
      // `index * PEEK_PX` below the bottom edge of the front toast.
      items.set(t.id, { y: front - scale * h + index * PEEK_PX, scale, behind: index > 0 })
    }
  })
  const n = newestFirst.length
  const height = n === 0 ? 0 : expanded ? Math.max(0, spread - GAP_PX) : front + (n - 1) * PEEK_PX
  return { items, height }
}

const HIDDEN = "opacity-0 transition-opacity duration-300 motion-reduce:transition-none"

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
  { icon: React.ReactNode; variant: AlertProps["variant"]; className?: string; srLabel?: string }
> = {
  // Banners use the Alert status variants, so text and icon flip with the theme and every pair
  // passes 4.5:1 on its own tint (pinned in tests/design-tokens). The error banner sits on the
  // opaque card colour, not Alert's translucent destructive tint: a floating toast can land over
  // the navy admin top bar, where 10% red lets the bar show through and drops the text to 2.7:1.
  success: {
    icon: <CircleCheck className="size-5 text-success" aria-hidden="true" />,
    variant: "success",
  },
  info: {
    icon: <Info className="size-5 text-info" aria-hidden="true" />,
    variant: "info",
  },
  warning: {
    icon: <CircleAlert className="size-5 text-warning" aria-hidden="true" />,
    variant: "warning",
    srLabel: "Warning",
  },
  error: {
    icon: <CircleX className="size-5 text-destructive" aria-hidden="true" />,
    variant: "destructive",
    className: "bg-card",
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
  const [expanded, setExpanded] = React.useState(false)
  const [heights, setHeights] = React.useState<Record<number, number>>({})
  const nextId = React.useRef(0)

  const reportHeight = React.useCallback((id: number, height: number) => {
    setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }))
  }, [])
  const layout = stackLayout(toasts, heights, expanded)

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
        className="pointer-events-none fixed inset-x-4 top-[calc(var(--nav-height)+var(--nav-offset)+1rem)] z-[60] sm:left-auto sm:w-80"
      >
        <ol
          className="pointer-events-auto relative"
          style={{ height: layout.height }}
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          onFocus={() => setExpanded(true)}
          onBlur={() => setExpanded(false)}
        >
          {toasts.map((toast) => (
            <ToastRow
              key={toast.id}
              toast={toast}
              dispatch={dispatch}
              slot={layout.items.get(toast.id)}
              stackExpanded={expanded}
              reportHeight={reportHeight}
              zIndex={toasts.indexOf(toast) + 1}
            />
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
  slot,
  stackExpanded,
  reportHeight,
  zIndex,
}: {
  toast: ToastItem
  dispatch: React.Dispatch<ToastAction>
  slot: { y: number; scale: number; behind: boolean } | undefined
  stackExpanded: boolean
  reportHeight: (id: number, height: number) => void
  zIndex: number
}) {
  const [hovered, setHovered] = React.useState(false)
  // Any hovered or focused toast opens the whole stack, and an open stack pauses every timer.
  const paused = hovered || stackExpanded
  const setPaused = setHovered
  const measureRef = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const node = measureRef.current
    if (!node) return
    reportHeight(toast.id, node.offsetHeight)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => reportHeight(toast.id, node.offsetHeight))
    observer.observe(node)
    return () => observer.disconnect()
  }, [toast.id, reportHeight])
  const { id, leaving, bump } = toast
  const style = TOAST_STYLES[toast.type]
  // A toast behind the newest shows only its card edge until the stack opens.
  const hideContent = Boolean(slot?.behind) && !stackExpanded

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
      className="absolute inset-x-0 top-0 origin-top transition-transform duration-500 ease-out-expo motion-reduce:transition-none"
      style={{
        zIndex,
        transform: slot ? `translateY(${slot.y}px) scale(${slot.scale})` : undefined,
      }}
    >
      <div ref={measureRef}>
        {/* Opaque base under the tinted Alert, so a toast behind never shows through the front one. */}
        <div className="rounded-lg bg-card">
          <Alert
            variant={style.variant}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className={cn(
              "pointer-events-auto flex animate-toast-in items-center gap-3 shadow-lg motion-reduce:animate-none",
              style.className,
              leaving && "animate-toast-out",
            )}
          >
            <span className={cn("shrink-0", hideContent && HIDDEN)}>{style.icon}</span>
            <p className={cn("flex-1 text-sm", hideContent && HIDDEN)}>
              {style.srLabel && <span className="sr-only">{style.srLabel}: </span>}
              {toast.message}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss notification"
              onClick={() => dispatch({ type: "dismiss", id })}
              className={cn(
                "h-6 w-6 shrink-0 cursor-pointer rounded-full p-0 hover:bg-foreground/10 hover:text-current focus-visible:ring-2 focus-visible:ring-current",
                hideContent && HIDDEN,
              )}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </Alert>
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
