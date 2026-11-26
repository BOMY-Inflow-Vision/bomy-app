import { PspUnsupportedError } from "./errors.js"
import { HitPayProvider } from "./hitpay/provider.js"
import type { PaymentProvider, PspProvider } from "./types.js"

// Lazy per-provider singletons. Construction reads no env and opens no connection (each
// provider reads env per call), so building one at import time would also be safe; it stays
// lazy to match the repo's lazy-singleton convention.
const instances = new Map<PspProvider, PaymentProvider>()
const overrides = new Map<PspProvider, PaymentProvider>()

function create(id: PspProvider): PaymentProvider {
  switch (id) {
    case "hitpay":
      return new HitPayProvider()
    case "stripe":
      // Lands in Stripe PR 4. Until then nothing may route a payment to Stripe.
      throw new PspUnsupportedError("stripe", "Stripe provider is not available yet")
    default: {
      const unknown: never = id
      throw new Error(`Unknown PSP provider: ${String(unknown)}`)
    }
  }
}

/**
 * The outbound client for a provider. Callers pass the provider PINNED ON THE ROW for any
 * follow-up call (cancel, refund) — never the currently active provider (design Invariant 2).
 */
export function getProvider(id: PspProvider): PaymentProvider {
  const override = overrides.get(id)
  if (override) return override
  let provider = instances.get(id)
  if (!provider) {
    provider = create(id)
    instances.set(id, provider)
  }
  return provider
}

/** Test seam: route `getProvider(id)` to a fake; `null` removes the override. */
export function setProviderOverride(id: PspProvider, provider: PaymentProvider | null): void {
  if (provider) overrides.set(id, provider)
  else overrides.delete(id)
}

/** Test seam: drop every cached instance and override. */
export function resetProviders(): void {
  instances.clear()
  overrides.clear()
}
