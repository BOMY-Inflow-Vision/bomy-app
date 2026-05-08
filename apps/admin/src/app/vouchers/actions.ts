"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"

async function getAdminId() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  return session.user.id
}

function parseMyrToSen(myr: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(myr)
  if (!m) throw new Error(`Invalid amount: "${myr}"`)
  const sen = BigInt(m[1]!) * 100n + BigInt((m[2] ?? "0").padEnd(2, "0"))
  if (sen === 0n) throw new Error("Amount must be greater than zero")
  return sen
}

export async function createVoucher(formData: FormData) {
  const userEmail = (formData.get("userEmail") as string | null)?.trim()
  const code = (formData.get("code") as string | null)?.trim()
  const fixedAmountMyr = (formData.get("fixedAmountMyr") as string | null)?.trim()
  const issuedMonth = (formData.get("issuedMonth") as string | null)?.trim()
  const expiresAt = (formData.get("expiresAt") as string | null)?.trim()

  if (!userEmail || !code || !fixedAmountMyr || !issuedMonth || !expiresAt) {
    throw new Error("Missing required fields")
  }

  const fixedAmountSen = parseMyrToSen(fixedAmountMyr)
  const adminId = await getAdminId()

  await withAdmin(getDb(), { userId: adminId, reason: "admin create voucher" }, async (tx) => {
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
  })
  revalidatePath("/vouchers")
}

export async function updateVoucherConfig(formData: FormData) {
  const voucherType = (formData.get("type") as string | null)?.trim()
  if (!voucherType || !["fixed_myr", "percentage", "random_myr"].includes(voucherType)) {
    throw new Error("Invalid voucher type")
  }

  const adminId = await getAdminId()

  await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin update voucher monthly config" },
    async (tx) => {
      type ConfigEntry = { key: string; value: unknown; description: string }
      const entries: ConfigEntry[] = [
        { key: "voucher_monthly_type", value: voucherType, description: "Monthly voucher type" },
      ]

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

      for (const entry of entries) {
        await tx
          .insert(schema.platformConfig)
          .values({
            key: entry.key,
            value: entry.value,
            description: entry.description,
            updatedBy: adminId,
          })
          .onConflictDoUpdate({
            target: schema.platformConfig.key,
            set: { value: entry.value, updatedBy: adminId, updatedAt: new Date() },
          })
      }
    },
  )
  revalidatePath("/vouchers")
}
