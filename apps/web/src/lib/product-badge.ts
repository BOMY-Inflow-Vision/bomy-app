export type ProductBadge = "New" | "Sold out"

const NEW_WINDOW_DAYS = 14

// A badge is shown only when stored data proves it. No variants is not "Sold out" (the product
// simply has nothing to sell yet). Sold out wins over New.
export function productBadge({
  createdAt,
  activeVariantCount,
  inStockVariantCount,
  now,
}: {
  createdAt: Date
  activeVariantCount: number
  inStockVariantCount: number
  now: Date
}): ProductBadge | null {
  if (activeVariantCount > 0 && inStockVariantCount === 0) return "Sold out"
  if (activeVariantCount === 0) return null
  const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000
  return ageDays <= NEW_WINDOW_DAYS ? "New" : null
}
