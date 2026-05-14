"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export interface CartItem {
  variantId: string
  productId: string
  storeId: string
  storeName: string
  storeSlug: string
  productName: string
  productSlug: string
  variantName: string
  /** Price in sen (MYR cents) — number, NOT bigint (safe for JSON / serialisation) */
  priceSen: number
  quantity: number
  coverImageUrl: string | null
}

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  hydrated: boolean
  addItem: (item: Omit<CartItem, "quantity">) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export const STORAGE_KEY = "bomy_cart"

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) setItems(parsed as CartItem[])
      }
    } catch {
      // corrupted storage — start empty
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((incoming: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === incoming.variantId)
      if (existing) {
        return prev.map((i) =>
          i.variantId === incoming.variantId ? { ...i, quantity: i.quantity + 1 } : i,
        )
      }
      return [...prev, { ...incoming, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId))
  }, [])

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.variantId !== variantId))
    } else {
      setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)))
    }
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  return (
    <CartContext.Provider
      value={{ items, itemCount, hydrated, addItem, removeItem, updateQuantity, clearCart }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used inside CartProvider")
  return ctx
}
