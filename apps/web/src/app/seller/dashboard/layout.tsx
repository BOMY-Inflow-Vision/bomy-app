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
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-5 py-2",
                  active
                    ? "border-l-2 border-primary bg-slate-700 text-slate-100"
                    : "hover:bg-slate-700 hover:text-slate-100",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 bg-muted">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
