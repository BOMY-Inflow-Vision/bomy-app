"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"

import { useCart } from "@/lib/cart"

export function NavBar() {
  const { itemCount, hydrated } = useCart()
  const { data: session } = useSession()

  return (
    <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
      <Link href="/" className="text-lg font-bold tracking-tight text-indigo-600">
        BOMY
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/products" className="text-sm text-gray-600 hover:text-gray-900">
          Products
        </Link>
        <Link href="/membership" className="text-sm text-gray-600 hover:text-gray-900">
          Membership
        </Link>
        <Link href="/seller/apply" className="text-sm text-gray-600 hover:text-gray-900">
          Sell with us
        </Link>
        <Link href="/cart" className="relative flex items-center text-gray-600 hover:text-gray-900">
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
        {session?.user ? (
          <>
            {session.user.role === "seller_owner" && (
              <Link href="/seller/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Seller
              </Link>
            )}
            <Link href="/account" className="text-sm text-gray-600 hover:text-gray-900">
              Account
            </Link>
          </>
        ) : (
          <Link href="/auth/sign-in" className="text-sm text-gray-600 hover:text-gray-900">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}
