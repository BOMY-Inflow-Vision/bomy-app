"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

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
  addItem: (item: Omit<CartItem, "quantity">) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = "bomy_cart"

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw) as CartItem[])
    } catch {
      // corrupted storage — start empty
    }
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
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.variantId !== variantId))
    } else {
      setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)))
    }
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider
      value={{ items, itemCount, addItem, removeItem, updateQuantity, clearCart }}
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
