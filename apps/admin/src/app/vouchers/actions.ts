"use server"

import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"
import { flashToast } from "@/lib/flash-toast-server"

// Server-form trigger (no client JS runs after submit) — must not throw for an expected
// failure; flashes a toast for both outcomes itself instead of returning a result.
export async function triggerVoucherIssuance(): Promise<void> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }

  const apiUrl = process.env["NEXT_PUBLIC_API_URL"]
  const secret = process.env["INTERNAL_API_SECRET"]
  if (!apiUrl || !secret) {
    // Never leak which env var is missing to the UI.
    await flashToast("error", "Voucher issuance isn't configured on this server.")
    return
  }

  try {
    const res = await fetch(`${apiUrl}/internal/jobs/voucher-issuance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      await flashToast("error", body.error ?? `API responded with ${res.status}`)
      return
    }
  } catch {
    await flashToast("error", "Could not reach the voucher issuance service.")
    return
  }

  revalidatePath("/vouchers")
  await flashToast("success", "Voucher issuance triggered.")
}

function parseMyrToSen(myr: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(myr)
  if (!m) throw new Error(`Invalid amount: "${myr}"`)
  const sen = BigInt(m[1]!) * 100n + BigInt((m[2] ?? "0").padEnd(2, "0"))
  if (sen === 0n) throw new Error("Amount must be greater than zero")
  return sen
}

export type CreateVoucherResult = { ok: true } | { ok: false; error: string }

// Bound to a client `useActionState` form (vouchers/new/new-voucher-form.tsx) rather than a
// server-form + redirect closure — a thrown error used to discard the whole form, so this
// returns a typed result and only redirects on success, keeping the client form mounted
// (and its entered values) on failure.
export async function createVoucher(
  _prevState: CreateVoucherResult | null,
  formData: FormData,
): Promise<CreateVoucherResult> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) return { ok: false, error: authz.error }

  const userEmail = (formData.get("userEmail") as string | null)?.trim()
  const code = (formData.get("code") as string | null)?.trim()
  const fixedAmountMyr = (formData.get("fixedAmountMyr") as string | null)?.trim()
  const issuedMonth = (formData.get("issuedMonth") as string | null)?.trim()
  const expiresAt = (formData.get("expiresAt") as string | null)?.trim()

  if (!userEmail || !code || !fixedAmountMyr || !issuedMonth || !expiresAt) {
    return { ok: false, error: "Missing required fields" }
  }

  let fixedAmountSen: bigint
  try {
    fixedAmountSen = parseMyrToSen(fixedAmountMyr)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid amount" }
  }

  try {
    await withAdmin(
      getDb(),
      { userId: authz.adminId, reason: "admin create voucher" },
      async (tx) => {
        const [user] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, userEmail))
          .limit(1)
        if (!user) throw new Error(`No user found with email: ${userEmail}`)

        await tx.insert(schema.vouchers).values({
          userId: user.id,
          code,
          type: "fixed_myr",
          fixedAmountSen,
          issuedMonth,
          expiresAt: new Date(expiresAt),
        })
      },
    )
  } catch (err) {
    // Only surface the one known, safe-to-show business error verbatim — anything else
    // (e.g. a raw DB error, a duplicate code) falls back to a generic message.
    if (err instanceof Error && err.message.startsWith("No user found with email:")) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: "Could not create voucher." }
  }

  revalidatePath("/vouchers")
  await flashToast("success", "Voucher created.")
  redirect("/vouchers")
}

type VoucherConfigEntry = { key: string; value: unknown; description: string }

// Server-form trigger (no client JS runs after submit) — must not throw for an expected
// failure; flashes a toast for both outcomes itself instead of returning a result. Validation
// throws are caught and flashed verbatim (all are our own hardcoded, safe-to-show messages);
// the DB write is caught separately with a generic message so a raw DB error never leaks.
export async function updateVoucherConfig(formData: FormData): Promise<void> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }

  const voucherType = (formData.get("type") as string | null)?.trim()
  if (!voucherType || !["fixed_myr", "percentage", "random_myr"].includes(voucherType)) {
    await flashToast("error", "Invalid voucher type.")
    return
  }

  const entries: VoucherConfigEntry[] = [
    { key: "voucher_monthly_type", value: voucherType, description: "Monthly voucher type" },
  ]

  try {
    if (voucherType === "fixed_myr") {
      const fixedMyr = (formData.get("fixedAmountMyr") as string | null)?.trim()
      if (!fixedMyr) throw new Error("Fixed amount is required")
      const sen = parseMyrToSen(fixedMyr)
      entries.push({
        key: "voucher_monthly_fixed_sen",
        value: Number(sen),
        description: "Monthly fixed voucher amount in sen",
      })
    } else if (voucherType === "percentage") {
      const pct = Number((formData.get("percentage") as string | null)?.trim())
      if (!Number.isInteger(pct) || pct <= 0 || pct > 100)
        throw new Error("Percentage must be 1–100")
      entries.push({
        key: "voucher_monthly_pct",
        value: pct,
        description: "Monthly percentage voucher value",
      })
    } else {
      const minMyr = (formData.get("randomMinMyr") as string | null)?.trim()
      const maxMyr = (formData.get("randomMaxMyr") as string | null)?.trim()
      if (!minMyr || !maxMyr) throw new Error("Min and max amounts are required")
      const minSen = parseMyrToSen(minMyr)
      const maxSen = parseMyrToSen(maxMyr)
      if (minSen >= maxSen) throw new Error("Min must be less than max")
      entries.push(
        {
          key: "voucher_monthly_random_min_sen",
          value: Number(minSen),
          description: "Monthly random voucher min amount in sen",
        },
        {
          key: "voucher_monthly_random_max_sen",
          value: Number(maxSen),
          description: "Monthly random voucher max amount in sen",
        },
      )
    }
  } catch (err) {
    await flashToast("error", err instanceof Error ? err.message : "Invalid input.")
    return
  }

  try {
    await withAdmin(
      getDb(),
      { userId: authz.adminId, reason: "admin update voucher monthly config" },
      async (tx) => {
        for (const entry of entries) {
          await tx
            .insert(schema.platformConfig)
            .values({
              key: entry.key,
              value: entry.value,
              description: entry.description,
              updatedBy: authz.adminId,
            })
            .onConflictDoUpdate({
              target: schema.platformConfig.key,
              set: { value: entry.value, updatedBy: authz.adminId, updatedAt: new Date() },
            })
        }
      },
    )
  } catch {
    await flashToast("error", "Could not save voucher config.")
    return
  }

  revalidatePath("/vouchers")
  await flashToast("success", "Voucher config saved.")
}
