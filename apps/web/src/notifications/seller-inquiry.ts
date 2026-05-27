import { joinUrl, type Mailer } from "@bomy/mailer"

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
