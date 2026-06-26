"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV = [
  { href: "/stores", label: "Stores" },
  { href: "/users", label: "Users" },
  { href: "/seller-inquiries", label: "Seller Inquiries" },
  { href: "/categories", label: "Categories" },
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

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <aside className="flex w-44 flex-col bg-slate-800 text-sm text-slate-400">
      <div className="border-b border-slate-700 px-4 py-4 text-sm font-bold text-slate-100">
        BOMY Admin
      </div>
      <nav className="flex flex-1 flex-col py-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "border-l-2 border-indigo-500 bg-slate-700 px-4 py-2 text-slate-100"
                  : "px-4 py-2 hover:bg-slate-700 hover:text-slate-100"
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="truncate border-t border-slate-700 px-4 py-3 text-xs text-slate-500">
        {email}
      </div>
    </aside>
  )
}
