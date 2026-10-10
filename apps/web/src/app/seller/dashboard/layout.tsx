"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const NAV = [
  { href: "/seller/dashboard", label: "Overview", exact: true },
  { href: "/seller/dashboard/subscriptions", label: "Subscriptions" },
  { href: "/seller/dashboard/products", label: "Products" },
  { href: "/seller/dashboard/orders", label: "Orders" },
  { href: "/seller/dashboard/settings", label: "Settings" },
]

export default function SellerDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)

  // On a phone the tabs scroll sideways: bring the active one fully into view. Sets scrollLeft
  // directly (never scrollIntoView, which can also move the page). A strip that does not scroll,
  // such as the desktop sidebar, ignores it.
  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active) return
    const left = active.offsetLeft
    const right = left + active.offsetWidth
    if (left >= nav.scrollLeft && right <= nav.scrollLeft + nav.clientWidth) return
    nav.scrollLeft = Math.max(0, left + active.offsetWidth / 2 - nav.clientWidth / 2)
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full flex-col bg-slate-800 text-sm text-slate-400 md:w-52 md:shrink-0">
        <div className="border-b border-slate-700 px-5 py-4 text-sm font-bold text-slate-100">
          My Store
        </div>
        <nav
          ref={navRef}
          className="flex overflow-x-auto py-2 md:flex-1 md:flex-col md:overflow-visible"
        >
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                {...(active ? { "aria-current": "page" as const } : {})}
                className={cn(
                  "whitespace-nowrap px-5 py-2",
                  active
                    ? "border-b-2 border-primary bg-slate-700 text-slate-100 md:border-b-0 md:border-l-2"
                    : "hover:bg-slate-700 hover:text-slate-100",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 bg-muted">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
