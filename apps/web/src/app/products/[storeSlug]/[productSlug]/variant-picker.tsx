"use client"

import { useState } from "react"

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
  const canAddToCart = selected && (selected.stockCount > 0 || isSpecialOrder)

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
    return <p className="text-sm text-gray-500">No variants available.</p>
  }

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      {variants.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Choose variant</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const vSpecial = v.fulfillmentMode === "backorder" || v.fulfillmentMode === "preorder"
              const outOfStock = v.stockCount === 0 && !vSpecial
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    v.id === selectedId
                      ? "border-indigo-600 bg-indigo-50 font-medium text-indigo-700"
                      : "border-gray-300 text-gray-700 hover:border-indigo-400"
                  } ${outOfStock ? "opacity-50 line-through" : ""}`}
                  disabled={outOfStock}
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
          <p className="text-2xl font-bold text-indigo-600">{formatMyrSen(selected.priceSen)}</p>
          {isSpecialOrder ? (
            <FulfillmentLabel mode={selected.fulfillmentMode} days={selected.preorderLeadDays} />
          ) : (
            <p className={`text-sm ${selected.stockCount > 0 ? "text-green-600" : "text-red-500"}`}>
              {selected.stockCount > 0 ? `${selected.stockCount} in stock` : "Out of stock"}
            </p>
          )}
        </div>
      )}

      {/* Add to cart */}
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!canAddToCart}
        className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {added
          ? "Added to cart ✓"
          : isSpecialOrder
            ? selected?.fulfillmentMode === "preorder"
              ? "Pre-order"
              : "Back-order"
            : "Add to cart"}
      </button>
    </div>
  )
}
