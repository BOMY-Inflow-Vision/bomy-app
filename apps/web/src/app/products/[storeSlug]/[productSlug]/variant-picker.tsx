"use client"

import { useState } from "react"
import { Check, ShoppingCart } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@bomy/ui/badge"
import { Button } from "@bomy/ui/button"
import { useToast } from "@/components/toaster"
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
    return <Badge variant="warning">Back-order — ships when available</Badge>
  }
  if (mode === "preorder") {
    return (
      <Badge variant="info">
        Pre-order{days ? ` — ships in ${days} ${days === 1 ? "day" : "days"}` : ""}
      </Badge>
    )
  }
  return null
}

export function VariantPicker({ product, variants }: VariantPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? "")
  const [added, setAdded] = useState(false)
  const { addItem } = useCart()
  const toast = useToast()

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
    toast.success(`${product.name} added to cart`)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (variants.length === 0) {
    return <p className="text-sm text-muted-foreground">No variants available.</p>
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* Variant selector */}
      {variants.length > 1 && (
        <div>
          <p id="variant-chooser-label" className="mb-2 text-sm font-medium text-foreground">
            Choose variant
          </p>
          <div
            role="group"
            aria-labelledby="variant-chooser-label"
            className="flex flex-wrap gap-2"
          >
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
                  aria-pressed={v.id === selectedId}
                  className={cn(
                    "inline-flex min-h-11 max-w-full items-center whitespace-normal rounded-full border px-4 py-2 text-left text-sm transition-colors [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    v.id === selectedId
                      ? "border-foreground bg-foreground font-medium text-background"
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
          <p className="text-2xl font-bold text-primary [overflow-wrap:anywhere]">
            {formatMyrSen(selected.priceSen)}
          </p>
          {isSpecialOrder ? (
            <FulfillmentLabel mode={selected.fulfillmentMode} days={selected.preorderLeadDays} />
          ) : (
            <p
              className={cn(
                "text-sm",
                selected.stockCount > 0 ? "text-success" : "text-destructive",
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
        icon={added ? <Check /> : <ShoppingCart />}
        arrowOnHover={!added}
        className="w-full text-sm font-semibold shadow-sm disabled:cursor-not-allowed sm:w-auto"
        size="lg"
      >
        {added ? "Added to cart" : "Add to cart"}
      </Button>
    </div>
  )
}
