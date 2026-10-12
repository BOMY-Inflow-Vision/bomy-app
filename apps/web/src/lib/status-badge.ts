import type { BadgeProps } from "@bomy/ui/badge"

type BadgeVariant = NonNullable<BadgeProps["variant"]>

// Maps are Maps, not object literals, so a status such as "constructor" falls back instead of
// reaching Object.prototype. Anything unknown is the neutral muted pill.
const PRODUCT_STATUS = new Map<string, BadgeVariant>([
  ["active", "success"],
  ["draft", "muted"],
  ["archived", "muted"],
])

const STORE_STATUS = new Map<string, BadgeVariant>([
  ["active", "success"],
  ["pending", "warning"],
  ["suspended", "destructive-subtle"],
])

export function productStatusVariant(status: string): BadgeVariant {
  return PRODUCT_STATUS.get(status) ?? "muted"
}

export function storeStatusVariant(status: string): BadgeVariant {
  return STORE_STATUS.get(status) ?? "muted"
}

// Badge adds a 1 px border, so a header pill that must keep its old size drops it (border-0)
// and keeps its original padding and weight.
export const HEADER_PILL_CLASS = "border-0 px-3 py-1 font-medium"
export const ORDER_HEADER_PILL_CLASS = "border-0 px-3 py-1 text-sm font-medium capitalize"
