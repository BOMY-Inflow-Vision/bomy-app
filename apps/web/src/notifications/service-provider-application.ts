import type { Mailer } from "@bomy/mailer"

export async function sendApplicantAck(
  mailer: Mailer,
  application: { name: string; email: string },
): Promise<void> {
  await mailer.sendMail({
    to: application.email,
    subject: "We received your BOMY service provider application",
    text:
      `Hi ${application.name},\n\n` +
      `We've received your application to become a BOMY service provider. ` +
      `Our team will review it and contact you soon.\n\n` +
      `BOMY Team`,
  })
}

export async function sendOpsAlert(
  mailer: Mailer,
  application: {
    applicationId: string
    name: string
    contactEmail: string
    contactNumber: string
    companyName: string
    category: string
  },
  env: { opsEmails: string[] },
): Promise<void> {
  // No admin link — the admin review page doesn't exist yet (spec §8). Don't
  // invent a placeholder URL; a future admin-review PR adds a real link here
  // once that page exists (Charlie's review, 2026-09-29).
  await mailer.sendMail({
    to: env.opsEmails,
    subject: `[BOMY Ops] New service provider application — ${application.companyName}`,
    text:
      `New service provider application received.\n\n` +
      `Name:     ${application.name}\n` +
      `Email:    ${application.contactEmail}\n` +
      `Contact:  ${application.contactNumber}\n` +
      `Company:  ${application.companyName}\n` +
      `Category: ${application.category}`,
  })
}
