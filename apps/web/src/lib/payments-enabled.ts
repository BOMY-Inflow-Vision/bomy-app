import { getProvider, type PspProvider } from "@bomy/psp"

import { readPaymentFlags } from "@/lib/active-psp"

/** `active` if it is a provider configured in this deployment, else null (fails closed). */
function configuredOrNull(active: PspProvider | null, caller: string): PspProvider | null {
  if (active === null) return null
  try {
    return getProvider(active).isConfigured() ? active : null
  } catch (err) {
    console.error(`[${caller}] provider lookup failed; payments fail closed`, err)
    return null
  }
}

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
 * `psp_provider`, never this function.
 */
export async function subscriptionPsp(): Promise<PspProvider | null> {
  const { activePsp, subscriptionsEnabled } = await readPaymentFlags()
  if (!subscriptionsEnabled) return null
  return configuredOrNull(activePsp, "subscriptionPsp")
}

/**
 * Gate for NEW membership / brand-subscription purchases: the /membership and
 * /brands/[slug]/subscribe CTAs, the account Renew link, the brand storefront's
 * "Subscription plans" link, and the matching server actions (defence in depth). Replaces the
 * PR #39 HitPay env sniff. The flag read is read-only (`withPublicRead`, migration 0041), so it
 * is safe on anonymous high-traffic pages.
 */
export async function paymentsEnabled(): Promise<boolean> {
  return (await subscriptionPsp()) !== null
}

/**
 * The provider a NEW order checkout session is created on, or null when the active provider is
 * unknown or not configured here. Shared by the /checkout page and `initiateCheckout`, so the
 * page never looks open while the action refuses. Independent of `subscriptions_enabled`; the
 * order gate itself stays `checkout_enabled`, which callers check first.
 */
export async function orderCheckoutPsp(): Promise<PspProvider | null> {
  const { activePsp } = await readPaymentFlags()
  return configuredOrNull(activePsp, "orderCheckoutPsp")
}
