"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import React, { useEffect, useState } from "react"

import { useCart } from "@/lib/cart"

const NAV_LINKS = [
  { href: "/products", label: "Products" },
  { href: "/membership", label: "Membership" },
  { href: "/seller/apply", label: "Sell with us" },
] as const

function CartLink() {
  const { itemCount, hydrated } = useCart()
  return (
    <Link
      href="/cart"
      aria-label="Cart"
      className="relative flex items-center text-gray-600 hover:text-gray-900"
    >
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
        />
      </svg>
      {hydrated && itemCount > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </Link>
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

  const authLinks = session?.user
    ? [
        ...(session.user.role === "seller_owner"
          ? [{ href: "/seller/dashboard", label: "Seller" }]
          : []),
        { href: "/account", label: "Account" },
      ]
    : [{ href: "/auth/sign-in", label: "Sign in" }]

  const desktopLinkClass = "text-sm text-gray-600 hover:text-gray-900"

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-indigo-600">
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
          {authLinks.map((link) => (
            <Link key={link.href} href={link.href} className={desktopLinkClass}>
              {link.label}
            </Link>
          ))}
        </div>

        {/* Mobile trigger cluster */}
        <div className="flex items-center gap-1 md:hidden">
          <CartLink />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="inline-flex items-center justify-center rounded-md p-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      <div
        id="mobile-menu"
        inert={!open}
        className={`absolute inset-x-0 top-full origin-top border-b border-gray-200 bg-white shadow-lg transition duration-200 ease-out md:hidden ${
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-0.5 p-2">
          {[...NAV_LINKS, ...authLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
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
          className="fixed inset-x-0 bottom-0 top-14 -z-10 cursor-default bg-gray-900/20 md:hidden"
        />
      )}
    </nav>
  )
}
