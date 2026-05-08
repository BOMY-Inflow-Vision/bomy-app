"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

async function getAdminId() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  return session.user.id
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

  const fixedAmountSen = BigInt(Math.round(parseFloat(fixedAmountMyr) * 100))
  const adminId = await getAdminId()

  await withAdmin(db, { userId: adminId, reason: "admin create voucher" }, async (tx) => {
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
