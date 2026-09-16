"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut } from "lucide-react"

import { signOutAction } from "@/app/auth/actions"
import { Button } from "@/components/ui/button"
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

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <aside className="flex w-44 flex-col bg-slate-800 text-sm text-slate-400">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4 text-sm font-bold text-slate-100">
        BOMY Admin
        <ThemeToggle />
      </div>
      <nav className="flex flex-1 flex-col py-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>
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
    </aside>
  )
}
