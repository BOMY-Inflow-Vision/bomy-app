"use client"

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

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 flex-col bg-slate-800 text-sm text-slate-400">
        <div className="border-b border-slate-700 px-5 py-4 text-sm font-bold text-slate-100">
          My Store
        </div>
        <nav className="flex flex-1 flex-col py-2">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            const isComingSoon =
              item.href !== "/seller/dashboard" &&
              item.href !== "/seller/dashboard/subscriptions" &&
              item.href !== "/seller/dashboard/products" &&
              item.href !== "/seller/dashboard/settings"
            return (
              <Link
                key={item.href}
                href={isComingSoon ? "#" : item.href}
                className={cn(
                  "px-5 py-2",
                  active
                    ? "border-l-2 border-primary bg-slate-700 text-slate-100"
                    : isComingSoon
                      ? "cursor-default text-slate-600"
                      : "hover:bg-slate-700 hover:text-slate-100",
                )}
                {...(isComingSoon
                  ? { onClick: (e: React.MouseEvent<HTMLAnchorElement>) => e.preventDefault() }
                  : {})}
              >
                {item.label}
                {isComingSoon && (
                  <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-xs text-primary/70">
                    soon
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 bg-muted">{children}</main>
    </div>
  )
}
