import { pspRef, type PspProvider } from "@bomy/psp"

/**
 * A PSP reference for an admin table cell: the provider-neutral psp_* value, falling back to
 * hitpay_* for a HitPay row written before the dual-write (Stripe design §4.1) — so a legacy
 * row shows its real id, not a dash, until migration 0040 has copied it across. "—" only when
 * the row genuinely has no reference.
 */
export function displayPspRef(
  provider: PspProvider,
  pspValue: string | null,
  hitpayValue: string | null,
): string {
  return pspRef(provider, pspValue, hitpayValue) ?? "—"
}
