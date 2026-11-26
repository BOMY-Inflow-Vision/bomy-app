import { eq } from "drizzle-orm"

import { schema, withAdmin, type makeDb } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

type Db = ReturnType<typeof makeDb>["db"]
type FlagKey = "active_psp" | "subscriptions_enabled"

/**
 * Set platform_config payment flags for a test and return a function that restores the exact
 * prior state (value, or row absence). Tests that call joinMembership / subscribeToBrand /
 * initiateCheckout need `subscriptions_enabled` / `active_psp` set explicitly, since 0039
 * seeds `subscriptions_enabled = false`.
 */
export async function setPaymentFlags(
  db: Db,
  flags: Partial<Record<FlagKey, unknown>>,
): Promise<() => Promise<void>> {
  const saved = new Map<FlagKey, { value: unknown } | null>()
  await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test set payment flags" }, async (tx) => {
    for (const [key, value] of Object.entries(flags) as Array<[FlagKey, unknown]>) {
      const [row] = await tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, key))
      saved.set(key, row ? { value: row.value } : null)
      if (row) {
        await tx
          .update(schema.platformConfig)
          .set({ value })
          .where(eq(schema.platformConfig.key, key))
      } else {
        await tx.insert(schema.platformConfig).values({ key, value, description: "test" })
      }
    }
  })
  return async () => {
    await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: "test restore payment flags" },
      async (tx) => {
        for (const [key, prior] of saved) {
          if (prior) {
            await tx
              .update(schema.platformConfig)
              .set({ value: prior.value })
              .where(eq(schema.platformConfig.key, key))
          } else {
            await tx.delete(schema.platformConfig).where(eq(schema.platformConfig.key, key))
          }
        }
      },
    )
  }
}
