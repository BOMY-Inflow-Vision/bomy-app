import { getProvider, type PspProvider } from "@bomy/psp"

import { readPaymentFlags } from "@/lib/active-psp"

/**
 * The provider a NEW membership or brand subscription is created on, or null when those flows
 * are closed. Server-only (reads platform_config and process.env).
 *
 * Open only when ALL of these hold (Stripe design §3.4 and §13 decision 3):
 * - `subscriptions_enabled` is `true` (default false; flipped by runbook, never in code);
 * - `active_psp` names a known provider;
 * - that provider reports `isConfigured()` in this deployment (the Stripe placeholder never
 *   does, so `active_psp = "stripe"` closes these flows until PR 4).
 *
 * Callers PIN the returned provider on the row they create and use it for the outbound call.
 * Follow-up calls on an existing row (cancel, refund, webhook) use the row's own
 * `psp_provider`, never this function. Order checkout is gated by `checkout_enabled`, not here.
 */
export async function subscriptionPsp(): Promise<PspProvider | null> {
  const { activePsp, subscriptionsEnabled } = await readPaymentFlags()
  if (!subscriptionsEnabled || activePsp === null) return null
  try {
    return getProvider(activePsp).isConfigured() ? activePsp : null
  } catch (err) {
    console.error("[subscriptionPsp] provider lookup failed; payments fail closed", err)
    return null
  }
}

/**
 * Gate for the /membership and /brands/[slug]/subscribe payment CTAs and the matching
 * server actions (defence in depth). Replaces the PR #39 HitPay env sniff.
 */
export async function paymentsEnabled(): Promise<boolean> {
  return (await subscriptionPsp()) !== null
}
