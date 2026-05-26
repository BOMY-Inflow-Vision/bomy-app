import { joinUrl, type Mailer } from "@bomy/mailer"

export async function sendApplicantAck(
  mailer: Mailer,
  inquiry: { name: string; email: string; storeName: string },
): Promise<void> {
  await mailer.sendMail({
    to: inquiry.email,
    subject: "We received your BOMY seller application",
    text:
      `Hi ${inquiry.name},\n\n` +
      `We've received your application for ${inquiry.storeName}. ` +
      `Our team will review it and contact you soon.\n\n` +
      `BOMY Team`,
  })
}

export async function sendOpsAlert(
  mailer: Mailer,
  inquiry: {
    inquiryId: string
    name: string
    email: string
    contactNumber: string
    companyName: string
    storeName: string
    message: string | null
  },
  env: { adminUrl: string; opsEmails: string[] },
): Promise<void> {
  const adminLink = joinUrl(env.adminUrl, "/seller-inquiries")
  const messageLine = inquiry.message ?? "(none)"

  await mailer.sendMail({
    to: env.opsEmails,
    subject: `[BOMY Ops] New seller inquiry — ${inquiry.storeName}`,
    text:
      `New seller inquiry received.\n\n` +
      `Name:    ${inquiry.name}\n` +
      `Email:   ${inquiry.email}\n` +
      `Contact: ${inquiry.contactNumber}\n` +
      `Company: ${inquiry.companyName}\n` +
      `Store:   ${inquiry.storeName}\n` +
      `Message: ${messageLine}\n\n` +
      `Review in admin: ${adminLink}`,
  })
}
