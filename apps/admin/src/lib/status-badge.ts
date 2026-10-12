import type { BadgeProps } from "@bomy/ui/badge"

type BadgeVariant = NonNullable<BadgeProps["variant"]>

// Maps are Maps, not object literals, so a status such as "constructor" falls back instead of
// reaching Object.prototype. Anything unknown is the neutral muted pill.
const STATUS = new Map<string, BadgeVariant>([
  ["pending", "warning"],
  ["active", "success"],
  ["cancelled", "muted"],
  ["expired", "destructive-subtle"],
  ["payment_failed", "destructive-subtle"],
  ["dispatched", "success"],
  ["delivered", "info"],
  ["suspended", "destructive-subtle"],
])

const STORE_STATUS = new Map<string, BadgeVariant>([
  ["pending", "warning"],
  ["active", "success"],
  ["suspended", "destructive-subtle"],
])

// Brand subscriptions, memberships and the goodie box.
export function statusVariant(status: string): BadgeVariant {
  return STATUS.get(status) ?? "muted"
}

export function storeStatusVariant(status: string): BadgeVariant {
  return STORE_STATUS.get(status) ?? "muted"
}
