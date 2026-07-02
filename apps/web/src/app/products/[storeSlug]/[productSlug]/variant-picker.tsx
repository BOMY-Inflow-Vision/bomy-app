"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { CartItem } from "@/lib/cart"
import { useCart } from "@/lib/cart"
import { formatMyrSen } from "@/lib/format"

type Variant = {
  id: string
  name: string
  priceSen: number
  stockCount: number
  attributes: Record<string, unknown>
  sortOrder: number
  fulfillmentMode: string
  preorderLeadDays: number | null
}

interface VariantPickerProps {
  product: {
    id: string
    name: string
    slug: string
    storeId: string
    storeName: string
    storeSlug: string
    coverImageUrl: string | null
  }
  variants: Variant[]
}

function FulfillmentLabel({ mode, days }: { mode: string; days: number | null }) {
  if (mode === "backorder") {
    return (
      <span className="inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
        Back-order — ships when available
      </span>
    )
  }
  if (mode === "preorder") {
    return (
      <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        Pre-order{days ? ` — ships in ${days} days` : ""}
      </span>
    )
  }
  return null
}

export function VariantPicker({ product, variants }: VariantPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? "")
  const [added, setAdded] = useState(false)
  const { addItem } = useCart()

  const selected = variants.find((v) => v.id === selectedId)

  const isSpecialOrder =
    selected?.fulfillmentMode === "backorder" || selected?.fulfillmentMode === "preorder"
  // Zero-stock special orders show the badge but are not yet purchasable — checkout does not
  // support fulfillment_mode-aware reservations yet. Keep disabled until that ships.
  const canAddToCart = selected && selected.stockCount > 0

  function handleAddToCart() {
    if (!selected) return
    const item: Omit<CartItem, "quantity"> = {
      variantId: selected.id,
      productId: product.id,
      storeId: product.storeId,
      storeName: product.storeName,
      storeSlug: product.storeSlug,
      productName: product.name,
      productSlug: product.slug,
      variantName: selected.name,
      priceSen: selected.priceSen,
      coverImageUrl: product.coverImageUrl,
    }
    addItem(item)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (variants.length === 0) {
    return <p className="text-sm text-muted-foreground">No variants available.</p>
  }

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      {variants.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Choose variant</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const vSpecial = v.fulfillmentMode === "backorder" || v.fulfillmentMode === "preorder"
              // Special-order variants stay selectable so buyers can see the badge;
              // only normal out-of-stock variants are visually disabled.
              const unavailable = v.stockCount === 0 && !vSpecial
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    v.id === selectedId
                      ? "border-primary bg-accent font-medium text-accent-foreground"
                      : "border-input text-foreground hover:border-primary",
                    unavailable && "opacity-50 line-through",
                  )}
                  disabled={unavailable}
                >
                  {v.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Price + stock / fulfillment status */}
      {selected && (
        <div className="space-y-1">
          <p className="text-2xl font-bold text-primary">{formatMyrSen(selected.priceSen)}</p>
          {isSpecialOrder ? (
            <FulfillmentLabel mode={selected.fulfillmentMode} days={selected.preorderLeadDays} />
          ) : (
            <p
              className={cn(
                "text-sm",
                selected.stockCount > 0 ? "text-green-600" : "text-destructive",
              )}
            >
              {selected.stockCount > 0 ? `${selected.stockCount} in stock` : "Out of stock"}
            </p>
          )}
        </div>
      )}

      {/* Add to cart */}
      <Button
        type="button"
        onClick={handleAddToCart}
        disabled={!canAddToCart}
        className="w-full rounded-xl px-6 py-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed"
        size="lg"
      >
        {added ? "Added to cart ✓" : "Add to cart"}
      </Button>
    </div>
  )
}
