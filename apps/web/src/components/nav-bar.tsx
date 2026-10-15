"use client"

import Link from "next/link"
import { MoreHorizontal, ShoppingCart, User } from "lucide-react"
import { useSession } from "next-auth/react"
import React, { useEffect, useState } from "react"

import { Badge } from "@bomy/ui/badge"
import { Button } from "@bomy/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bomy/ui/dropdown-menu"
import { ButtonGroup } from "@/components/ui/button-group"
import { NavIconButton } from "@/components/nav-icon-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { useCart } from "@/lib/cart"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/brands", label: "Brands" },
  { href: "/products", label: "Products" },
  { href: "/membership", label: "Membership" },
  { href: "/seller/apply", label: "Sell with us" },
  { href: "/provider/apply", label: "Become a provider" },
] as const

const SIGN_IN_HREF = "/auth/sign-in"

function CartLink() {
  const { itemCount, hydrated } = useCart()
  return (
    <NavIconButton asChild className="relative [&_svg]:size-6">
      <Link href="/cart" aria-label="Cart">
        <ShoppingCart strokeWidth={1.5} aria-hidden="true" />
        {hydrated && itemCount > 0 && (
          <Badge
            key={itemCount}
            variant="default"
            className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-badge-pop justify-center border-0 p-0 text-[10px] font-bold motion-reduce:animate-none"
          >
            {itemCount > 99 ? "99+" : itemCount}
          </Badge>
        )}
      </Link>
    </NavIconButton>
  )
}

/** Account icon (links to /account) joined with a "..." button that opens the seller menu. */
function SellerAccountMenu({
  accountHref,
  accountLabel,
  sellerHref,
  sellerLabel,
}: {
  accountHref: string
  accountLabel: string
  sellerHref: string
  sellerLabel: string
}) {
  return (
    <ButtonGroup>
      <Button variant="outline" size="icon" aria-label={accountLabel} asChild>
        <Link href={accountHref}>
          <User aria-hidden="true" />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Seller menu">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-32">
          <DropdownMenuItem asChild>
            <Link href={sellerHref}>{sellerLabel}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}

export function NavBar() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const sellerLink =
    session?.user?.role === "seller_owner" ? { href: "/seller/dashboard", label: "Seller" } : null

  const accountLink = session?.user
    ? { href: "/account", label: "Account" }
    : { href: SIGN_IN_HREF, label: "Sign in" }

  const mobileAuthLinks = [...(sellerLink ? [sellerLink] : []), accountLink]

  const desktopLinkClass = "text-sm text-muted-foreground hover:text-foreground"

  return (
    <nav className="sticky top-0 z-50 border-b border-subtle bg-card shadow-sm">
      <div className="mx-auto flex h-nav max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tighter text-primary">
          BOMY
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-4 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={desktopLinkClass}>
              {link.label}
            </Link>
          ))}
          <CartLink />
          {sellerLink ? (
            <SellerAccountMenu
              accountHref={accountLink.href}
              accountLabel={accountLink.label}
              sellerHref={sellerLink.href}
              sellerLabel={sellerLink.label}
            />
          ) : (
            <NavIconButton asChild>
              <Link href={accountLink.href} aria-label={accountLink.label}>
                <User aria-hidden="true" />
              </Link>
            </NavIconButton>
          )}
          <ThemeToggle />
        </div>

        {/* Mobile trigger cluster */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <CartLink />
          <NavIconButton
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="size-11 rounded-md transition-none"
          >
            <span className="relative flex h-6 w-6 items-center justify-center" aria-hidden="true">
              <span
                className={cn(
                  "absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-300 ease-spring motion-reduce:transition-none",
                  open ? "translate-y-0 rotate-45" : "-translate-y-1.5 rotate-0",
                )}
              />
              <span
                className={cn(
                  "absolute h-0.5 w-4 rounded-full bg-current transition-opacity duration-150 motion-reduce:transition-none",
                  open ? "opacity-0" : "opacity-100",
                )}
              />
              <span
                className={cn(
                  "absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-300 ease-spring motion-reduce:transition-none",
                  open ? "translate-y-0 -rotate-45" : "translate-y-1.5 rotate-0",
                )}
              />
            </span>
          </NavIconButton>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      <div
        id="mobile-menu"
        inert={!open}
        className={cn(
          "absolute inset-x-0 top-full origin-top border-b border-subtle bg-card shadow-lg transition duration-200 ease-out md:hidden",
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="flex flex-col gap-0.5 p-2">
          {[...NAV_LINKS, ...mobileAuthLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-base text-foreground hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Backdrop — tap outside to close */}
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-x-0 bottom-0 top-nav -z-10 cursor-default bg-gray-900/20 md:hidden"
        />
      )}
    </nav>
  )
}
