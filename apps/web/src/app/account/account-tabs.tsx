import Link from "next/link"

import { cn } from "@/lib/utils"

interface Props {
  active: "profile" | "subscriptions" | "orders" | "addresses"
}

export function AccountTabs({ active }: Props) {
  const base = "px-4 py-2 text-sm font-medium border-b-2 transition-colors"

  return (
    <nav aria-label="Account sections" className="flex border-b border-border mb-6 -mx-8 px-8">
      <Link
        href="/account"
        aria-current={active === "profile" ? "page" : undefined}
        className={cn(
          base,
          active === "profile"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
        )}
      >
        Profile
      </Link>
      <Link
        href="/account/subscriptions"
        aria-current={active === "subscriptions" ? "page" : undefined}
        className={cn(
          base,
          active === "subscriptions"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
        )}
      >
        Subscriptions
      </Link>
      <Link
        href="/account/orders"
        aria-current={active === "orders" ? "page" : undefined}
        className={cn(
          base,
          active === "orders"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
        )}
      >
        Orders
      </Link>
      <Link
        href="/account/addresses"
        aria-current={active === "addresses" ? "page" : undefined}
        className={cn(
          base,
          active === "addresses"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
        )}
      >
        Addresses
      </Link>
    </nav>
  )
}
