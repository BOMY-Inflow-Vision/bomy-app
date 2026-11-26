import { sql } from "drizzle-orm"
import { ArrowLeftRight } from "lucide-react"

import { schema, withAdmin, type UserRole } from "@bomy/db"
import { PSP_PROVIDER_IDS, getProvider, isPspProvider } from "@bomy/psp"
import { Alert } from "@bomy/ui/alert"
import { Badge } from "@bomy/ui/badge"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { PSP_LABELS, PSP_SWITCH_ROLES } from "@/lib/psp-switch"
import { Button } from "@/components/admin-ui/button"
import { PageFrame } from "@/components/admin-ui/page-frame"
import { PageHeader } from "@/components/admin-ui/page-header"
import { Tile } from "@/components/admin-ui/tile"

import { setActivePsp } from "./actions"

function flagLabel(value: unknown): string {
  return value === true ? "On" : "Off"
}

export default async function ConfigPage() {
  const { id: adminId, role } = await requireAdmin()
  const canSwitch = (PSP_SWITCH_ROLES as readonly UserRole[]).includes(role)

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin view config" },
    async (tx) =>
      tx
        .select({
          key: schema.platformConfig.key,
          value: schema.platformConfig.value,
          description: schema.platformConfig.description,
          updatedAt: schema.platformConfig.updatedAt,
        })
        .from(schema.platformConfig)
        .orderBy(sql`${schema.platformConfig.key} asc`),
  )

  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const rawActive = byKey.get("active_psp")
  const active = isPspProvider(rawActive) ? rawActive : null
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"]

  return (
    <PageFrame className="space-y-8">
      <PageHeader title="Platform Config" />

      <section aria-labelledby="psp-heading" className="flex flex-col gap-4">
        <h2 id="psp-heading" className="text-lg font-semibold text-foreground">
          Payment provider
        </h2>
        <Tile className="flex flex-col gap-5 p-6">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">New payments use</dt>
              <dd className="font-semibold text-foreground">
                {active ? PSP_LABELS[active] : "Unknown value: payments are off"}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Memberships and brand subscriptions</dt>
              <dd className="font-semibold text-foreground">
                {flagLabel(byKey.get("subscriptions_enabled"))}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Order checkout</dt>
              <dd className="font-semibold text-foreground">
                {flagLabel(byKey.get("checkout_enabled"))}
              </dd>
            </div>
          </dl>

          <Alert variant="warning" className="flex flex-col gap-2 text-sm">
            <p>
              Switching only changes the provider for new payments. Payments, renewals, cancels and
              refunds already started stay on their own provider, so keep both providers&apos;
              credentials set while any of their payments can still move money. The two on/off
              switches above are changed by runbook, not here.
            </p>
            <p>
              <strong>Switching provider does not stop payments.</strong> The storefront can have a
              provider&apos;s keys even when this admin app doesn&apos;t, so new payments could move
              there. To stop all new payments, turn order checkout and subscriptions off first, then
              switch: see the emergency stop in{" "}
              <code className="font-mono text-xs">docs/runbooks/active-psp-switch.md</code> §2.
            </p>
          </Alert>

          {canSwitch ? (
            <ul className="flex flex-col gap-3">
              {PSP_PROVIDER_IDS.map((id) => {
                const isActive = id === active
                const available = getProvider(id).isConfigured()
                return (
                  <li
                    key={id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{PSP_LABELS[id]}</span>
                      {isActive ? <Badge variant="success">Active</Badge> : null}
                      {!available ? <Badge variant="muted">Not available yet</Badge> : null}
                    </div>
                    {!isActive ? (
                      <form action={setActivePsp}>
                        <input type="hidden" name="activePsp" value={id} />
                        <Button
                          type="submit"
                          variant="secondary"
                          icon={<ArrowLeftRight aria-hidden="true" />}
                          disabled={!available}
                        >
                          Use {PSP_LABELS[id]} for new payments
                        </Button>
                      </form>
                    ) : null}
                  </li>
                )
              })}
              {active !== "hitpay" && !getProvider("hitpay").isConfigured() ? (
                <li className="text-sm text-muted-foreground">
                  HitPay isn&apos;t set up on this admin app, so it can&apos;t be selected here. In
                  an emergency, follow §2 of the runbook above (switches off first, then the
                  provider).
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only admin and finance staff can change the payment provider.
            </p>
          )}

          {apiUrl ? (
            <p className="text-sm text-muted-foreground">
              Webhook set-up on the API:{" "}
              <a
                href={`${apiUrl}/ready`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                open the API status page
              </a>{" "}
              (the <code className="font-mono text-xs">psp</code> block).
            </p>
          ) : null}
        </Tile>
      </section>

      <section aria-labelledby="all-config-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="all-config-heading" className="text-lg font-semibold text-foreground">
            All settings
          </h2>
          <Badge variant="warning">Read-only</Badge>
        </div>
        <Tile className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{row.key}</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {JSON.stringify(row.value)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.description ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.updatedAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No config entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Tile>
      </section>
    </PageFrame>
  )
}
