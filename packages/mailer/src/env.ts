import type { MailerConfig } from "./mailer.js"

export function configFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): MailerConfig {
  const enabled = env["EMAIL_DELIVERY_ENABLED"] === "true"
  const host = env["SMTP_HOST"] ?? ""
  const portRaw = env["SMTP_PORT"] ?? "587"
  const port = parseInt(portRaw, 10)
  const secure = env["SMTP_SECURE"] === "true"
  const user = env["SMTP_USER"]
  const pass = env["SMTP_PASS"]
  const from = env["MAIL_FROM"] ?? ""
  const replyTo = env["MAIL_REPLY_TO"]

  if (enabled) {
    if (!host) throw new Error("SMTP_HOST is required when EMAIL_DELIVERY_ENABLED=true")
    if (!from) throw new Error("MAIL_FROM is required when EMAIL_DELIVERY_ENABLED=true")
    if (isNaN(port)) throw new Error("SMTP_PORT must be a valid number")
    if (Boolean(user) !== Boolean(pass)) {
      throw new Error("SMTP_USER and SMTP_PASS must both be set or both absent")
    }
  }

  return {
    enabled,
    host,
    port,
    secure,
    from,
    ...(user !== undefined ? { user } : {}),
    ...(pass !== undefined ? { pass } : {}),
    ...(replyTo !== undefined ? { replyTo } : {}),
  }
}
