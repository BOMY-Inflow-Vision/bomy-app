import type { Mailer } from "./mailer.js"

export async function sendMagicLink(
  mailer: Mailer,
  opts: { to: string; url: string; from?: string },
): Promise<void> {
  await mailer.sendMail({
    to: opts.to,
    subject: "Sign in to BOMY",
    ...(opts.from ? { from: opts.from } : {}),
    text:
      `Sign in to BOMY\n\n` +
      `Click the link below to sign in. The link expires in 24 hours and can only be used once.\n\n` +
      `${opts.url}\n\n` +
      `If you didn't request this email, you can safely ignore it.\n\n` +
      `BOMY Team`,
  })
}
