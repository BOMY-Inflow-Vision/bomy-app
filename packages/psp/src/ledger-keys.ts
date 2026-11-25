import type { PspProvider } from "./types.js"

/**
 * Builds a `ledger_entries.idempotency_key` for a PSP-originated money movement
 * (Stripe design §4.3).
 *
 * - **hitpay**: the legacy, UNPREFIXED format — `parts.join(":")`. It must never change: the
 *   HitPay refund handler recomputes keys to detect replays, and `ledger_entries` is
 *   append-only. e.g. `ledgerKey("hitpay", "membership", "recurring", payId, "credit")` →
 *   `membership:recurring:<payId>:credit`.
 * - **any other provider**: namespaced with the provider id — `stripe:<parts…>` — so a Stripe
 *   id can never collide with a HitPay key.
 *
 * Order keys (`checkout:{sessionId}:credit`, `order:{orderId}:…`) are keyed on BOMY uuids, are
 * already provider-neutral, and do NOT go through this helper.
 *
 * Throws on an empty part: a blank id would silently merge distinct payments onto one key.
 */
export function ledgerKey(provider: PspProvider, ...parts: string[]): string {
  if (parts.length === 0) throw new Error("ledgerKey: at least one part is required")
  for (const p of parts) {
    if (p === "") throw new Error("ledgerKey: empty key part")
  }
  const body = parts.join(":")
  return provider === "hitpay" ? body : `${provider}:${body}`
}
