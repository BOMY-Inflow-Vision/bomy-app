import { joinUrl, type Mailer } from "@bomy/mailer"

export async function sendApprovalEmail(
  mailer: Mailer,
  inquiry: { name: string | null; email: string; storeName: string; storeSlug: string },
  env: { appUrl: string },
): Promise<void> {
  const signInLink = joinUrl(env.appUrl, "/auth/sign-in")
  await mailer.sendMail({
    to: inquiry.email,
    subject: `Your BOMY seller application — next steps`,
    text:
      `Hi ${inquiry.name ?? "there"},\n\n` +
      `Thanks for applying to sell on BOMY. Your application for ${inquiry.storeName} ` +
      `has moved to the next step — our team is now reviewing your store.\n\n` +
      `Sign in once at ${signInLink} so your account is ready when your store ` +
      `goes live. We'll be in touch once everything is set up.\n\n` +
      `BOMY Team`,
  })
}
