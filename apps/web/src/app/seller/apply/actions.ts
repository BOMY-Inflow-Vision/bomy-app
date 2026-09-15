"use server"

import { parseOpsEmails } from "@bomy/mailer"
import { schema } from "@bomy/db"

import { getDb } from "@/lib/db"
import { getMailer } from "@/lib/mailer"
import { verifyTurnstile } from "@/lib/turnstile"
import { sendApplicantAck, sendOpsAlert } from "@/notifications/seller-inquiry"

const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/

// Validation failures are returned, not thrown: production redacts thrown Server Action messages.
export type SellerInquiryResult = { ok: true } | { ok: false; error: string }

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

export async function submitSellerInquiry(formData: FormData): Promise<SellerInquiryResult> {
  // 1. Turnstile verify FIRST — before any field validation, DB insert,
  //    or mail dispatch. Failure → generic form-level error; no side effects.
  const rawToken = formData.get("cf-turnstile-response")
  const token = typeof rawToken === "string" && rawToken.length > 0 ? rawToken : null
  const verify = await verifyTurnstile(token)
  if (!verify.success) {
    return { ok: false, error: "Verification failed. Please try the challenge again." }
  }

  // 2. Required-field validation.
  const name = readFormString(formData, "name")
  const email = readFormString(formData, "email")
  const contactNumber = readFormString(formData, "contactNumber")
  const companyName = readFormString(formData, "companyName")
  const storeName = readFormString(formData, "storeName")
  const message = readFormString(formData, "message") || null

  if (!name || !email || !contactNumber || !companyName || !storeName) {
    return { ok: false, error: "All required fields must be filled in." }
  }

  // 3. Single-address email shape validation (defense in depth on top of Turnstile).
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please provide a valid email address." }
  }

  // 4. DB insert.
  const [inserted] = await getDb()
    .insert(schema.sellerInquiries)
    .values({ name, email, contactNumber, companyName, storeName, message })
    .returning({ id: schema.sellerInquiries.id })
  const inquiryId = inserted!.id

  // 5. Dispatch BOTH emails with per-recipient try/catch isolation.
  //    Applicant fail → ops still tried. Ops fail → applicant already attempted.
  const mailer = getMailer()

  try {
    await sendApplicantAck(mailer, { name, email, storeName })
  } catch (err) {
    console.error({
      event: "email_notification_failed",
      recipientType: "applicant",
      inquiryId,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  const opsEmails = parseOpsEmails(process.env)
  if (opsEmails.length === 0) {
    console.info({
      event: "email_notification_skipped",
      reason: "missing_ops_recipients",
      inquiryId,
    })
    return { ok: true }
  }

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

  return { ok: true }
}
