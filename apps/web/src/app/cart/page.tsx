"use client"

import Link from "next/link"
import { CreditCard, Minus, Plus, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/toaster"
import { formatMyrSen } from "@/lib/format"
import { useCart, type CartItem } from "@/lib/cart"

function QuantityStepper({
  value,
  onIncrement,
  onDecrement,
}: {
  value: number
  onIncrement: () => void
  onDecrement: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-input bg-muted/40 py-0.5 pl-2 pr-0.5">
      <span className="relative inline-flex h-4 w-4 items-center justify-center overflow-hidden text-center text-xs font-semibold tabular-nums text-foreground">
        <span key={value} className="animate-wheel-roll-in motion-reduce:animate-none">
          {value}
        </span>
      </span>
      {/* Each button keeps a 24x24 hit area (WCAG 2.2 SC 2.5.8) even though it
          renders smaller, matching the reference's compact stack. */}
      <div className="flex flex-col">
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={onIncrement}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Plus className="size-3" />
        </button>
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={onDecrement}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Minus className="size-3" />
        </button>
      </div>
    </div>
  )
}

export default function CartPage() {
  const { items, itemCount, removeItem, updateQuantity, hydrated } = useCart()
  const toast = useToast()

  function remove(item: CartItem) {
    removeItem(item.variantId)
    toast.info(`${item.productName} removed from cart`)
  }

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
          <Button variant="link" icon={<Search />} className="mt-4" asChild>
            <Link href="/products">Browse products</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-4">
            {items.map((item) => (
              <li
                key={item.variantId}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-background p-4 sm:flex-nowrap sm:gap-4"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {item.coverImageUrl ? (
                    <img
                      src={item.coverImageUrl}
                      alt={item.productName}
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl text-muted-foreground">
                      📦
                    </div>
                  )}
                </div>

                {/* On mobile this sits in row 1 next to the image (flex-1 + justify-end
                    stretches it to the far right); sm:order-3 moves it back to last so
                    the row reads image → info → actions on wider screens. */}
                <div className="flex flex-1 items-center justify-end gap-2 self-center sm:order-3 sm:flex-none">
                  <QuantityStepper
                    value={item.quantity}
                    onIncrement={() => updateQuantity(item.variantId, item.quantity + 1)}
                    onDecrement={() =>
                      item.quantity > 1
                        ? updateQuantity(item.variantId, item.quantity - 1)
                        : remove(item)
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 />}
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={() => remove(item)}
                  >
                    Remove
                  </Button>
                </div>

                {/* w-full forces this onto its own wrapped row on mobile (row 2); on
                    sm: it un-wraps back between the image and actions. */}
                <div className="w-full sm:order-2 sm:w-auto sm:flex-1">
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
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Subtotal</span>
              <span className="text-lg font-bold text-foreground">{formatMyrSen(subtotal)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Shipping, vouchers, and any brand-subscription discounts are applied at checkout — the
              final price you pay will be shown there.
            </p>
            <Button asChild icon={<CreditCard />} className="mt-4 w-full">
              <Link href="/checkout">Continue to checkout</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
