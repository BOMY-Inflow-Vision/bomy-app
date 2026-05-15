"use client"

import Link from "next/link"

import { formatMyrSen } from "@/lib/format"
import { useCart } from "@/lib/cart"

export default function CartPage() {
  const { items, itemCount, removeItem, updateQuantity, hydrated } = useCart()

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Your Cart</h1>
      </main>
    )
  }

  const subtotal = items.reduce((sum, item) => sum + item.priceSen * item.quantity, 0)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Your Cart {itemCount > 0 && <span className="text-gray-400">({itemCount})</span>}
      </h1>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-20 text-center">
          <p className="text-sm text-gray-400">Your cart is empty.</p>
          <Link
            href="/products"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.variantId}
              className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {item.coverImageUrl ? (
                  <img
                    src={item.coverImageUrl}
                    alt={item.productName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl text-gray-300">
                    📦
                  </div>
                )}
              </div>

              <div className="flex-1">
                <Link
                  href={`/products/${item.storeSlug}/${item.productSlug}`}
                  className="text-sm font-medium text-gray-900 hover:text-indigo-600"
                >
                  {item.productName}
                </Link>
                <p className="text-xs text-gray-500">
                  {item.storeName} · {item.variantName}
                </p>
                <p className="mt-1 text-sm font-semibold text-indigo-600">
                  {formatMyrSen(item.priceSen)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.variantId)}
                  className="ml-2 text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Subtotal</span>
              <span className="text-lg font-bold text-gray-900">{formatMyrSen(subtotal)}</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">Checkout coming soon.</p>
          </div>
        </div>
      )}
    </main>
  )
}
