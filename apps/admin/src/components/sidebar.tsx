"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Menu, X } from "lucide-react"

import { signOutAction } from "@/app/auth/actions"
import { Button } from "@bomy/ui/button"
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

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            className={cn(
              "px-4 py-2",
              active
                ? "border-l-2 border-primary bg-slate-700 text-slate-100"
                : "hover:bg-slate-700 hover:text-slate-100",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

function AccountFooter({ email }: { email: string }) {
  return (
    <div className="border-t border-slate-700 px-4 py-3 text-xs text-slate-500">
      <div className="truncate">{email}</div>
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          icon={<LogOut />}
          arrowOnHover={false}
          className="mt-2 w-full justify-start text-slate-300 hover:bg-transparent hover:text-slate-100"
        >
          Sign out
        </Button>
      </form>
    </div>
  )
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
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
      {/* md and up: the sidebar as before */}
      <aside className="hidden w-44 flex-col bg-slate-800 text-sm text-slate-400 md:flex">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4 text-sm font-bold text-slate-100">
          BOMY Admin
          <ThemeToggle />
        </div>
        <nav className="flex flex-1 flex-col py-2">
          <NavLinks pathname={pathname} />
        </nav>
        <AccountFooter email={email} />
      </aside>

      {/* Below md: a sticky top bar with a menu panel */}
      <header className="sticky top-0 z-40 bg-slate-800 text-sm text-slate-400 md:hidden">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2 text-sm font-bold text-slate-100">
          BOMY Admin
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="admin-mobile-menu"
              className="size-8 rounded-full text-slate-400 hover:bg-slate-700 hover:text-slate-100"
            >
              {open ? (
                <X aria-hidden="true" className="size-4" />
              ) : (
                <Menu aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
        </div>
        <div
          ref={panelRef}
          id="admin-mobile-menu"
          hidden={!open}
          className="max-h-[calc(100dvh-3.25rem)] overflow-y-auto border-b border-slate-700"
        >
          <nav className="flex flex-col py-2">
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
          <AccountFooter email={email} />
        </div>
      </header>
    </>
  )
}
