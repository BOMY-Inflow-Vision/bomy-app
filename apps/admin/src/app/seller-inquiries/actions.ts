"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function deleteInquiry(inquiryId: string) {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await withAdmin(
    db,
    { userId: session.user.id, reason: "admin delete seller inquiry" },
    async (tx) => {
      await tx.delete(schema.sellerInquiries).where(eq(schema.sellerInquiries.id, inquiryId))
    },
  )
  revalidatePath("/seller-inquiries")
}
