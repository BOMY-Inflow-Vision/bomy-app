"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { formatMyrSen } from "@/lib/format"
import { useCart } from "@/lib/cart"

export default function CartPage() {
  const { items, itemCount, removeItem, updateQuantity, hydrated } = useCart()

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Your Cart</h1>
      </main>
    )
  }

  const subtotal = items.reduce((sum, item) => sum + item.priceSen * item.quantity, 0)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">
        Your Cart {itemCount > 0 && <span className="text-muted-foreground">({itemCount})</span>}
      </h1>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input py-20 text-center">
          <p className="text-sm text-muted-foreground">Your cart is empty.</p>
          <Link
            href="/products"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.variantId}
              className="flex items-start gap-4 rounded-xl border border-border bg-background p-4"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                {item.coverImageUrl ? (
                  <img
                    src={item.coverImageUrl}
                    alt={item.productName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl text-muted-foreground">
                    📦
                  </div>
                )}
              </div>

              <div className="flex-1">
                <Link
                  href={`/products/${item.storeSlug}/${item.productSlug}`}
                  className="text-sm font-medium text-foreground hover:text-primary"
                >
                  {item.productName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {item.storeName} · {item.variantName}
                </p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {formatMyrSen(item.priceSen)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                >
                  −
                </Button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                >
                  +
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => removeItem(item.variantId)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Subtotal</span>
              <span className="text-lg font-bold text-foreground">{formatMyrSen(subtotal)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Shipping, vouchers, and any brand-subscription discounts are applied at checkout — the
              final price you pay will be shown there.
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href="/checkout">Continue to checkout</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
