"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Menu, X } from "lucide-react"

import { signOutAction } from "@/app/auth/actions"
import { Button } from "@/components/admin-ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/stores", label: "Stores" },
  { href: "/products", label: "Products" },
  { href: "/users", label: "Users" },
  { href: "/seller-inquiries", label: "Seller Inquiries" },
  { href: "/categories", label: "Product Cats" },
  { href: "/store-categories", label: "Store Cats" },
  { href: "/memberships", label: "Memberships" },
  { href: "/brand-subscriptions", label: "Brand Subs" },
  { href: "/brand-plans", label: "Brand Plans" },
  { href: "/goodie-box", label: "Goodie Box" },
  { href: "/vouchers", label: "Vouchers" },
  { href: "/checkout-sessions", label: "Sessions" },
  { href: "/orders", label: "Orders" },
  { href: "/payouts", label: "Payouts" },
  { href: "/config", label: "Config" },
]

// Where the active pill sits: every row is 48px (a 44px link with 2px above and below), and the pill's
// box is one row tall, so link number N is N x 100% of the pill's own height down the list. Written out
// whole, because Tailwind only emits a class it can read in full in the source. One entry per NAV item,
// in order.
const PILL_OFFSET = [
  "translate-y-0",
  "translate-y-full",
  "translate-y-[200%]",
  "translate-y-[300%]",
  "translate-y-[400%]",
  "translate-y-[500%]",
  "translate-y-[600%]",
  "translate-y-[700%]",
  "translate-y-[800%]",
  "translate-y-[900%]",
  "translate-y-[1000%]",
  "translate-y-[1100%]",
  "translate-y-[1200%]",
  "translate-y-[1300%]",
  "translate-y-[1400%]",
] as const

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`)

function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="text-xl font-extrabold leading-none tracking-tight text-primary">BOMY</span>
      <span className="rounded-md bg-foreground/[.07] px-1.5 py-0.5 font-mono text-xs leading-none tracking-wider text-muted-foreground">
        ADMIN
      </span>
    </span>
  )
}

// One dark pill sits behind the links and slides to the active one (a transform, so it is cheap and
// stops under prefers-reduced-motion). The links are text on top of it.
function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const activeIndex = NAV.findIndex((item) => isActive(pathname, item.href))
  const activeLink = useRef<HTMLAnchorElement>(null)
  // On a short screen the list scrolls inside the tile: keep the current page in view.
  useEffect(() => {
    activeLink.current?.scrollIntoView?.({ block: "nearest" })
  }, [activeIndex])
  return (
    <ul role="list" className="relative flex flex-col">
      <li
        aria-hidden="true"
        data-pill
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-12 transition-[transform,opacity] duration-300 ease-spring motion-reduce:transition-none",
          activeIndex < 0 ? "opacity-0" : PILL_OFFSET[activeIndex],
        )}
      >
        <span className="my-0.5 block h-11 rounded-2xl bg-sidebar" />
      </li>
      {NAV.map((item, i) => {
        const active = i === activeIndex
        return (
          <li key={item.href} className="relative py-0.5">
            <Link
              ref={active ? activeLink : undefined}
              href={item.href}
              aria-current={active ? "page" : undefined}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              className={cn(
                "flex h-11 items-center rounded-2xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "text-sidebar-strong"
                  : "text-foreground/80 hover:bg-foreground/[.05] hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Account({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-3 px-2 pt-3">
      <span
        aria-hidden="true"
        className="grid size-10 flex-none place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
      >
        {Array.from(email)[0]?.toUpperCase() ?? "?"}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{email}</span>
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          className="size-9 flex-none rounded-full text-muted-foreground hover:bg-foreground/[.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut aria-hidden="true" />
        </Button>
      </form>
    </div>
  )
}

// The sidebar's content, drawn twice: in the floating tile (lg and up) and in the phone drawer.
function SidebarBody({
  email,
  pathname,
  onNavigate,
  headerEnd,
}: {
  email: string
  pathname: string
  onNavigate?: () => void
  headerEnd: React.ReactNode
}) {
  return (
    <>
      <div className="flex h-14 flex-none items-center justify-between pl-3 pr-1">
        <Logo />
        {headerEnd}
      </div>
      <nav aria-label="Admin" className="mt-3 min-h-0 flex-1 overflow-y-auto">
        <NavLinks pathname={pathname} {...(onNavigate ? { onNavigate } : {})} />
      </nav>
      <div className="flex-none border-t border-border pb-1 pt-1">
        <Account email={email} />
      </div>
    </>
  )
}

const TOGGLE_CLASS =
  "text-muted-foreground hover:bg-foreground/[.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // The drawer covers the page: put the keyboard inside it.
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      // Escape hides the panel, so focus that was inside it would be lost: return it to the menu
      // button. Focus anywhere else (the theme toggle, the page) is left where it is.
      const active = document.activeElement
      if (active && panelRef.current?.contains(active)) triggerRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      {/* lg and up: the sidebar is a floating tile pinned to the left. */}
      <aside className="fixed bottom-3 left-3 top-3 z-30 hidden w-64 flex-col rounded-3xl bg-card p-3 text-card-foreground shadow-tile lg:flex">
        <SidebarBody
          email={email}
          pathname={pathname}
          headerEnd={<ThemeToggle className={TOGGLE_CLASS} />}
        />
      </aside>

      {/* Below lg: a sticky top bar, and the same sidebar slides in over the page. */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-muted/90 px-4 backdrop-blur-md lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle className={cn("h-11 w-11 bg-card shadow-tile", TOGGLE_CLASS)} />
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen((value) => !value)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="admin-mobile-menu"
            className={cn("size-11 rounded-full bg-card shadow-tile", TOGGLE_CLASS)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        </div>
      </header>

      <div
        id="admin-mobile-menu"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed inset-0 z-[70] lg:hidden",
          // Visible at once on open (a hidden element cannot take focus), and hidden only after
          // the slide-out has finished on close.
          open ? "visible" : "invisible transition-[visibility] duration-300",
        )}
      >
        <span
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/45 transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal={open}
          aria-label="Menu"
          className={cn(
            "absolute bottom-2 left-2 top-2 flex w-[min(288px,calc(100vw-16px))] flex-col rounded-3xl bg-card p-3 text-card-foreground shadow-tile transition-transform duration-300 ease-out motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-[108%]",
          )}
        >
          <SidebarBody
            email={email}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
            headerEnd={
              <Button
                ref={closeRef}
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className={cn("size-9 rounded-full", TOGGLE_CLASS)}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            }
          />
        </div>
      </div>
    </>
  )
}
