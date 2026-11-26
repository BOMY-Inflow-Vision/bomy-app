import { inArray } from "drizzle-orm"
import { cache } from "react"

import { schema, withAdmin } from "@bomy/db"
import { isPspProvider, type PspProvider } from "@bomy/psp"

import { getDb } from "@/lib/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

export interface PaymentFlags {
  /** platform_config `active_psp`; null when the row is missing, malformed or unreadable. */
  activePsp: PspProvider | null
  /** platform_config `subscriptions_enabled`; true only for the JSON value `true`. */
  subscriptionsEnabled: boolean
}

const CLOSED: PaymentFlags = { activePsp: null, subscriptionsEnabled: false }

/**
 * Both payment flags in one read (Stripe design §3.4), so a page view writes one
 * `admin_bypass_audit` row, not two.
 *
 * - `platform_config` is staff-only under RLS (`platform_config_staff_read`); no policy lets a
 *   buyer or anonymous read reach these keys, so this is a `withAdmin` read, as
 *   `readCheckoutEnabled` is. The optional public-flag policy (design §3.4, would be 0041) is
 *   not added in PR 3.
 * - React `cache()` gives one read per request; there is deliberately no cross-request cache,
 *   so an admin switch takes effect on the next request.
 * - Fails CLOSED: a missing row, an unknown value or a DB error all yield
 *   `{ activePsp: null, subscriptionsEnabled: false }`, which every gate treats as "off".
 */
export const readPaymentFlags = cache(async (): Promise<PaymentFlags> => {
  try {
    const rows = await withAdmin(
      getDb(),
      { userId: SYSTEM_ACTOR, reason: "read payment flags (active_psp, subscriptions_enabled)" },
      async (tx) =>
        tx
          .select({ key: schema.platformConfig.key, value: schema.platformConfig.value })
          .from(schema.platformConfig)
          .where(inArray(schema.platformConfig.key, ["active_psp", "subscriptions_enabled"])),
    )
    const byKey = new Map(rows.map((r) => [r.key, r.value]))
    const active = byKey.get("active_psp")
    return {
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
