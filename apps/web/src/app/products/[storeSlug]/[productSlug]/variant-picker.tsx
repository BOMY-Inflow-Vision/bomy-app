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

export function VariantPicker({ product, variants }: VariantPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? "")
  const [added, setAdded] = useState(false)
  const { addItem } = useCart()

  const selected = variants.find((v) => v.id === selectedId)

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
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  v.id === selectedId
                    ? "border-indigo-600 bg-indigo-50 font-medium text-indigo-700"
                    : "border-gray-300 text-gray-700 hover:border-indigo-400"
                } ${v.stockCount === 0 ? "opacity-50 line-through" : ""}`}
                disabled={v.stockCount === 0}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Price + stock */}
      {selected && (
        <div>
          <p className="text-2xl font-bold text-indigo-600">{formatMyrSen(selected.priceSen)}</p>
          <p
            className={`mt-1 text-sm ${selected.stockCount > 0 ? "text-green-600" : "text-red-500"}`}
          >
            {selected.stockCount > 0 ? `${selected.stockCount} in stock` : "Out of stock"}
          </p>
        </div>
      )}

      {/* Add to cart */}
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!selected || selected.stockCount === 0}
        className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {added ? "Added to cart ✓" : "Add to cart"}
      </button>
    </div>
  )
}
