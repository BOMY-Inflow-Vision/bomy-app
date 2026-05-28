import { eq } from "drizzle-orm"

import { schema, withAdmin, withTenant, type Database } from "../../src/index.js"

import {
  ActorError,
  DbError,
  KeyMissingError,
  UsageError,
  parseValue,
  validateUuidShape,
  type Args,
} from "./platform-config-flip-args.js"

const ADMIN_ROLES = ["bomy_ops", "bomy_admin", "bomy_finance"] as const
type AdminRole = (typeof ADMIN_ROLES)[number]

function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

export interface FlipResult {
  actor: { id: string; email: string; role: AdminRole }
  key: string
  oldValue: unknown
  newValue: unknown
  platformConfigAuditId: string
  changedAt: Date
}

export async function runPlatformConfigFlip(db: Database, args: Args): Promise<FlipResult> {
  // 1. Validate args shape (the wrapper already runs parseArgs, but defense in depth).
  if (!validateUuidShape(args.actor)) {
    throw new UsageError(`--actor '${args.actor}' is not a UUID-shaped string.`)
  }
  if (!args.reason.trim()) {
    throw new UsageError(`--reason must be non-empty.`)
  }

  // parseValue throws UsageError on invalid JSON.
  const newValue = parseValue(args.value)

  // 2. Actor lookup under withTenant with lowest-privilege role.
  // The users row-self-select RLS policy lets a user read their own row regardless
  // of their actual role, so "buyer" is safe for the lookup itself.
  const actorRows = await withTenant(db, { userId: args.actor, userRole: "buyer" }, async (tx) =>
    tx
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, args.actor)),
  )

  const actorRow = actorRows[0]
  if (!actorRow) {
    throw new ActorError(`--actor ${args.actor} not found in users table.`)
  }
  if (!isAdminRole(actorRow.role)) {
    throw new ActorError(
      `--actor ${args.actor} has role '${actorRow.role}'; must be one of bomy_ops / bomy_admin / bomy_finance.`,
    )
  }
  const actor = { id: actorRow.id, email: actorRow.email, role: actorRow.role }

  // 3. Key pre-read under withTenant using the actor's real role.
  // Confirms the key exists AND that the actor can see platform_config under RLS.
  const keyRows = await withTenant(db, { userId: actor.id, userRole: actor.role }, async (tx) =>
    tx
      .select({ id: schema.platformConfig.id, value: schema.platformConfig.value })
      .from(schema.platformConfig)
      .where(eq(schema.platformConfig.key, args.key)),
  )

  const keyRow = keyRows[0]
  if (!keyRow) {
    throw new KeyMissingError(
      `--key '${args.key}' does not exist in platform_config. Refusing to create new keys.`,
    )
  }
  const oldValue = keyRow.value

  // 4. Write under withAdmin — updates platform_config, writes platform_config_audit.
  //    withAdmin itself writes admin_bypass_audit in the same transaction.
  const writeResult = await withAdmin(db, { userId: actor.id, reason: args.reason }, async (tx) => {
    const [updated] = await tx
      .update(schema.platformConfig)
      .set({ value: newValue, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(schema.platformConfig.key, args.key))
      .returning({ id: schema.platformConfig.id, value: schema.platformConfig.value })

    if (!updated) {
      throw new DbError(`UPDATE on platform_config returned no rows for key '${args.key}'.`)
    }

    const [auditRow] = await tx
      .insert(schema.platformConfigAudit)
      .values({
        configId: updated.id,
        key: args.key,
        oldValue: oldValue,
        newValue: updated.value,
        changedBy: actor.id,
      })
      .returning({
        id: schema.platformConfigAudit.id,
        changedAt: schema.platformConfigAudit.changedAt,
      })

    if (!auditRow) {
      throw new DbError("INSERT on platform_config_audit returned no row.")
    }

    return { newValue: updated.value, auditRow }
  })

  return {
    actor,
    key: args.key,
    oldValue,
    newValue: writeResult.newValue,
    platformConfigAuditId: writeResult.auditRow.id,
    changedAt: writeResult.auditRow.changedAt,
  }
}
