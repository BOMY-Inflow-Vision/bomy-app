import { inArray } from "drizzle-orm"
import { cache } from "react"

import { schema, withPublicRead } from "@bomy/db"
import { isPspProvider, type PspProvider } from "@bomy/psp"

import { getDb } from "@/lib/db"

/** The only platform_config keys a non-staff context can read (RLS policy from migration 0041). */
const PUBLIC_FLAG_KEYS = ["checkout_enabled", "active_psp", "subscriptions_enabled"] as const

export interface PaymentFlags {
  /** platform_config `checkout_enabled`; true only for the JSON value `true`. */
  checkoutEnabled: boolean
  /** platform_config `active_psp`; null when the row is missing, malformed or unreadable. */
  activePsp: PspProvider | null
  /** platform_config `subscriptions_enabled`; true only for the JSON value `true`. */
  subscriptionsEnabled: boolean
}

const CLOSED: PaymentFlags = {
  checkoutEnabled: false,
  activePsp: null,
  subscriptionsEnabled: false,
}

/**
 * The three payment flags in one read (Stripe design §3.4).
 *
 * - `withPublicRead` (READ ONLY transaction, nil-UUID context): RLS policy
 *   `platform_config_public_flags_read` (migration 0041) exposes exactly these three rows to
 *   non-staff contexts, so the read writes nothing, in particular no `admin_bypass_audit` row.
 *   Only `key` and `value` are selected: RLS cannot hide `updated_by` / `description`.
 * - React `cache()` gives one read per request; there is deliberately no cross-request cache,
 *   so an admin or CLI change takes effect on the next request (every page is dynamic: the
 *   root layout is `force-dynamic`).
 * - Fails CLOSED: a missing row, an unknown value or a DB error all yield every flag off.
 *   Before 0041 is applied the policy is absent and the read returns no rows, so everything
 *   reads as off (no error).
 */
export const readPaymentFlags = cache(async (): Promise<PaymentFlags> => {
  try {
    const rows = await withPublicRead(getDb(), async (tx) =>
      tx
        .select({ key: schema.platformConfig.key, value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(inArray(schema.platformConfig.key, [...PUBLIC_FLAG_KEYS])),
    )
    const byKey = new Map(rows.map((r) => [r.key, r.value]))
    const active = byKey.get("active_psp")
    return {
      checkoutEnabled: byKey.get("checkout_enabled") === true,
      activePsp: isPspProvider(active) ? active : null,
      subscriptionsEnabled: byKey.get("subscriptions_enabled") === true,
    }
  } catch (err) {
    console.error("[readPaymentFlags] platform_config read failed; payments fail closed", err)
    return CLOSED
  }
})

/** The provider for NEW payments, or null (fail closed) when it cannot be resolved. */
export async function getActivePsp(): Promise<PspProvider | null> {
  return (await readPaymentFlags()).activePsp
}

/**
 * The order checkout gate (`platform_config.checkout_enabled`). Lives here, NOT in the
 * `"use server"` checkout actions file, so it is not exposed as a callable server action.
 * Fails closed (missing row, non-`true` value, DB error → false).
 */
export async function readCheckoutEnabled(): Promise<boolean> {
  return (await readPaymentFlags()).checkoutEnabled
}
