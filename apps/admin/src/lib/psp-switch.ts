import type { PspProvider } from "@bomy/psp"

/**
 * Roles that may change `active_psp` (Stripe design §13 decision 6: bomy_admin + bomy_finance,
 * no two-person approval). Enforced server-side in `setActivePsp`, both by `requireAdminId`
 * and by a re-read of the actor's role inside the write transaction. The page uses it only to
 * decide whether to show the switch.
 */
export const PSP_SWITCH_ROLES = ["bomy_admin", "bomy_finance"] as const

export const PSP_LABELS: Record<PspProvider, string> = {
  hitpay: "HitPay",
  stripe: "Stripe",
}
