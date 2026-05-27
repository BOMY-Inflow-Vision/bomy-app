"use server"

import { parseOpsEmails } from "@bomy/mailer"
import { makeDb, schema } from "@bomy/db"

import { getMailer } from "@/lib/mailer"
import { sendOpsAlert } from "@/notifications/seller-inquiry"

const { db } = makeDb()

// Single-address shape: rejects empty parts, whitespace, and any character
// nodemailer could parse as a recipient separator (`,` `;` `<` `>` `"`) or a
// second `@`. Public submissions never reach an outbound `to:` field, but the
// submitted email is still persisted, so we validate shape on the boundary.
const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/

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

  if (!EMAIL_RE.test(email)) {
    throw new Error("Please provide a valid email address.")
  }

  const [inserted] = await db
    .insert(schema.sellerInquiries)
    .values({ name, email, contactNumber, companyName, storeName, message })
    .returning({ id: schema.sellerInquiries.id })
  const inquiryId = inserted!.id

  const opsEmails = parseOpsEmails(process.env)
  if (opsEmails.length === 0) {
    console.info({
      event: "email_notification_skipped",
      reason: "missing_ops_recipients",
      inquiryId,
    })
    return
  }

  const mailer = getMailer()
  try {
    await sendOpsAlert(
      mailer,
      { inquiryId, name, email, contactNumber, companyName, storeName, message },
      { adminUrl: process.env["ADMIN_URL"] ?? "", opsEmails },
    )
  } catch (err) {
    console.error({
      event: "email_notification_failed",
      recipientType: "ops",
      inquiryId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
