import fp from "fastify-plugin"

import { createMailer, type Mailer } from "../lib/mailer.js"

declare module "fastify" {
  interface FastifyInstance {
    mailer: Mailer
  }
}

export const mailerPlugin = fp(async (app) => {
  const enabled = process.env["EMAIL_DELIVERY_ENABLED"] === "true"
  const host = process.env["SMTP_HOST"] ?? ""
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10)
  const secure = process.env["SMTP_SECURE"] === "true"
  const user = process.env["SMTP_USER"]
  const pass = process.env["SMTP_PASS"]
  const from = process.env["MAIL_FROM"] ?? ""
  const replyTo = process.env["MAIL_REPLY_TO"]

  if (enabled) {
    if (!host) throw new Error("SMTP_HOST is required when EMAIL_DELIVERY_ENABLED=true")
    if (!from) throw new Error("MAIL_FROM is required when EMAIL_DELIVERY_ENABLED=true")
    if (Boolean(user) !== Boolean(pass)) {
      throw new Error("SMTP_USER and SMTP_PASS must both be set or both absent")
    }
  }

  const mailer = createMailer(
    {
      enabled,
      host,
      port,
      secure,
      from,
      ...(user !== undefined ? { user } : {}),
      ...(pass !== undefined ? { pass } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
    },
    { info: (obj, msg) => app.log.info(obj, msg) },
  )

  app.decorate("mailer", mailer)
  app.addHook("onClose", async () => {
    await mailer.close()
  })
})
