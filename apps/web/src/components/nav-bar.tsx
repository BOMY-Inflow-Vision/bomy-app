"use client"

import Link from "next/link"
import { MoreHorizontal, ShoppingCart, User } from "lucide-react"
import { useSession } from "next-auth/react"
import React, { useEffect, useRef, useState } from "react"

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
import { useScrolled } from "@/lib/use-scrolled"
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
    <NavIconButton
      asChild
      className="relative h-12 w-auto gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:brightness-90 [&_svg]:size-5"
    >
      <Link href="/cart" aria-label="Cart">
        <ShoppingCart strokeWidth={1.5} aria-hidden="true" />
        <span data-cart-label className="hidden lg:inline">
          Cart
        </span>
        {/* The counter sits inside the pill, beside the label. Before the cart is read from storage
            it keeps its place but shows no number, so the pill never jumps or shows a wrong count. */}
        <span
          key={itemCount}
          data-cart-count
          className={cn(
            "grid size-6 animate-badge-pop place-items-center rounded-full bg-card text-xs font-medium tabular-nums text-foreground motion-reduce:animate-none",
            !hydrated && "opacity-0",
          )}
        >
          {hydrated ? (itemCount > 99 ? "99+" : itemCount) : ""}
        </span>
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
  const scrolled = useScrolled()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // The closed panel is inert, which would drop focus that is inside it: hand it back to the
      // menu button. Focus anywhere else (the menu button itself, the theme toggle, the cart) stays.
      const active = document.activeElement
      setOpen(false)
      if (active && panelRef.current?.contains(active)) triggerRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // The mobile menu does not exist from md up; close it there so it cannot come back open when the
  // window shrinks again.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false)
    }
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  const sellerLink =
    session?.user?.role === "seller_owner" ? { href: "/seller/dashboard", label: "Seller" } : null

  const accountLink = session?.user
    ? { href: "/account", label: "Account" }
    : { href: SIGN_IN_HREF, label: "Sign in" }

  const mobileAuthLinks = [...(sellerLink ? [sellerLink] : []), accountLink]

  const desktopLinkClass =
    "rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none sticky top-0 z-50 px-3 pt-[var(--nav-offset)] sm:px-5"
    >
      <div className="pointer-events-auto relative mx-auto max-w-[1400px]">
        <div
          data-scrolled={scrolled}
          className="flex h-nav items-center justify-between rounded-full border border-subtle bg-card/85 pl-5 pr-2 shadow-sm backdrop-blur-md transition-[background-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] data-[scrolled=true]:bg-card/95 data-[scrolled=true]:shadow-md motion-reduce:transition-none"
        >
          <Link href="/" className="font-display text-lg font-bold tracking-tighter text-primary">
            BOMY
          </Link>

          {/* Desktop nav */}
          <div className="hidden flex-1 items-center lg:flex">
            <div className="flex flex-1 items-center justify-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={desktopLinkClass}>
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2">
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
          </div>

          {/* Mobile trigger cluster */}
          <div className="flex items-center gap-1 lg:hidden">
            <ThemeToggle />
            <CartLink />
            <NavIconButton
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="size-11 rounded-md transition-none"
            >
              <span
                className="relative flex h-6 w-6 items-center justify-center"
                aria-hidden="true"
              >
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
          ref={panelRef}
          inert={!open}
          data-lenis-prevent
          className={cn(
            "absolute inset-x-0 top-full mt-2 max-h-[calc(100dvh-var(--nav-height)-var(--nav-offset)-1.25rem)] origin-top overflow-y-auto overflow-x-hidden overscroll-contain rounded-bento border border-subtle bg-card shadow-lg transition duration-200 ease-out lg:hidden",
            open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
          )}
        >
          <div className="flex flex-col gap-0.5 p-2">
            {[...NAV_LINKS, ...mobileAuthLinks].map((link) => (
              <Button
                key={link.href}
                asChild
                variant="ghost"
                className="h-auto justify-start rounded-md px-3 py-3 text-base font-normal text-foreground transition-none hover:bg-muted hover:text-foreground"
              >
                <Link href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Backdrop — tap outside to close. The nav shell is pointer-events-none, so the scrim opts back in. */}
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="pointer-events-auto fixed inset-x-0 bottom-0 top-nav-clear -z-10 cursor-default bg-scrim/30 lg:hidden"
        />
      )}
    </nav>
  )
}
