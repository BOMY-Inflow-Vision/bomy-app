"use server"

import { makeDb, schema } from "@bomy/db"

const { db } = makeDb()

export async function submitSellerInquiry(formData: FormData) {
  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim()
  const contactNumber = (formData.get("contactNumber") as string)?.trim()
  const companyName = (formData.get("companyName") as string)?.trim()
  const storeName = (formData.get("storeName") as string)?.trim()
  const message = ((formData.get("message") as string) ?? "").trim() || null

  if (!name || !email || !contactNumber || !companyName || !storeName) {
    throw new Error("All required fields must be filled in.")
  }

  await db.insert(schema.sellerInquiries).values({
    name,
    email,
    contactNumber,
    companyName,
    storeName,
    message,
  })

  // Email stub: log for now, wire SendGrid here when ready.
  console.log(`[seller-inquiry] New inquiry from ${name} <${email}> — store: ${storeName}`)
}
