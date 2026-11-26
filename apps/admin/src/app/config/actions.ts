"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin, type UserRole } from "@bomy/db"
import { getProvider, isPspProvider } from "@bomy/psp"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"
import { flashToast } from "@/lib/flash-toast-server"
import { PSP_LABELS, PSP_SWITCH_ROLES } from "@/lib/psp-switch"

const KEY = "active_psp"

type Outcome =
  | { kind: "changed"; from: unknown }
  | { kind: "unchanged" }
  | { kind: "forbidden" }
  | { kind: "missing" }

/**
 * Switch the provider used for NEW payments (Stripe design §3.4, PR 3).
 *
 * - Server-side role gate: `requireAdminId` (via authorizeAdminAction; fails closed on a stale
 *   or unrefreshable role), then the actor's role is re-read from `users` inside the write
 *   transaction and that row is held FOR SHARE until commit, so a demotion inside the 5-minute
 *   JWT refresh window, or one racing this write, is refused or serialised after it.
 * - old→new audit: `SELECT … FOR UPDATE` → `UPDATE` → `INSERT platform_config_audit` in ONE
 *   `withAdmin` transaction, copying `platform-config-flip-core.ts`. A no-op (same value)
 *   writes no config audit row.
 * - Only `active_psp` is written. `checkout_enabled` and `subscriptions_enabled` are never
 *   touched here; they stay runbook flips.
 * - A provider whose adapter is not configured on admin cannot be ENABLED here: admin needs
 *   that provider's credentials to cancel and refund the rows created under it. The Stripe
 *   placeholder is never configured, so Stripe cannot be selected until PR 4. The emergency
 *   switch back to a dormant HitPay (design §11 kill switch) is the audited ops CLI, see
 *   docs/runbooks/active-psp-switch.md; payments then fail closed.
 * - Existing rows keep their own `psp_provider`; nothing here rewrites them.
 */
export async function setActivePsp(formData: FormData): Promise<void> {
  const authz = await authorizeAdminAction({ roles: PSP_SWITCH_ROLES })
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }
  const adminId = authz.adminId

  const next = formData.get("activePsp")
  if (!isPspProvider(next)) {
    await flashToast("error", "Choose HitPay or Stripe.")
    return
  }
  if (!getProvider(next).isConfigured()) {
    await flashToast(
      "error",
      `${PSP_LABELS[next]} isn't available on this server yet, so it can't be selected.`,
    )
    return
  }

  let outcome: Outcome
  try {
    outcome = await withAdmin(
      getDb(),
      { userId: adminId, reason: `admin set active_psp -> ${next}` },
      async (tx): Promise<Outcome> => {
        // Lock order (deadlock-safe, same as the ops CLI): actor's users row FOR SHARE first,
        // then the config row FOR UPDATE. FOR SHARE blocks a concurrent role UPDATE until this
        // transaction ends, so the role checked here is still the role when active_psp is
        // written, even if we wait on the config lock. A demotion either commits first (we see
        // it and refuse) or waits for us (serialised after the switch). Role updates touch only
        // the users row, so no lock cycle is possible.
        const [actor] = await tx
          .select({ role: schema.users.role })
          .from(schema.users)
          .where(eq(schema.users.id, adminId))
          .for("share")
        if (!actor || !(PSP_SWITCH_ROLES as readonly UserRole[]).includes(actor.role)) {
          return { kind: "forbidden" }
        }

        const [locked] = await tx
          .select({ id: schema.platformConfig.id, value: schema.platformConfig.value })
          .from(schema.platformConfig)
          .where(eq(schema.platformConfig.key, KEY))
          .for("update")
        if (!locked) return { kind: "missing" }
        if (locked.value === next) return { kind: "unchanged" }

        const [updated] = await tx
          .update(schema.platformConfig)
          .set({ value: next, updatedBy: adminId, updatedAt: new Date() })
          .where(and(eq(schema.platformConfig.id, locked.id), eq(schema.platformConfig.key, KEY)))
          .returning({ id: schema.platformConfig.id, value: schema.platformConfig.value })
        if (!updated) throw new Error("UPDATE on platform_config active_psp returned no row")

        await tx.insert(schema.platformConfigAudit).values({
          configId: updated.id,
          key: KEY,
          oldValue: locked.value,
          newValue: updated.value,
          changedBy: adminId,
        })
        return { kind: "changed", from: locked.value }
      },
    )
  } catch (err) {
    console.error("[setActivePsp] write failed; active_psp unchanged", err)
    await flashToast("error", "Couldn't change the payment provider. Nothing was changed.")
    return
  }

  switch (outcome.kind) {
    case "forbidden":
      await flashToast("error", "You don't have permission to do that.")
      return
    case "missing":
      // Never create the key here: it is seeded by migration 0039.
      await flashToast("error", "The active_psp setting is missing. Nothing was changed.")
      return
    case "unchanged":
      await flashToast("info", `${PSP_LABELS[next]} is already the payment provider.`)
      return
    case "changed": {
      const from = isPspProvider(outcome.from) ? PSP_LABELS[outcome.from] : "an unknown value"
      revalidatePath("/config")
      await flashToast(
        "success",
        `New payments now use ${PSP_LABELS[next]} (was ${from}). Existing payments stay on their own provider.`,
      )
      return
    }
  }
}
