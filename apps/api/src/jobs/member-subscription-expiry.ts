import type { Database } from "@bomy/db"

import { expireAbandonedPendingMemberships } from "./expire-abandoned-pending-memberships.js"
import { expireCancelledMemberships } from "./expire-cancelled-memberships.js"

/**
 * Run both member-subscription housekeeping sweeps. Called by
 * MemberSubscriptionExpiryJob (daily 00:10 MYT — see scheduler.ts).
 * Returns counts of rows updated by each sweep.
 */
export async function expireMemberSubscriptions(
  db: Database,
): Promise<{ cancelledCount: number; abandonedCount: number }> {
  const [cancelledCount, abandonedCount] = await Promise.all([
    expireCancelledMemberships(db),
    expireAbandonedPendingMemberships(db),
  ])
  return { cancelledCount, abandonedCount }
}
