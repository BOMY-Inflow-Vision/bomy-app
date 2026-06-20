import nodemailer from "nodemailer"

export interface Mailer {
  sendMail(opts: {
    to: string | string[]
    subject: string
    text: string
    from?: string
  }): Promise<void>
  close(): Promise<void>
}

export interface MailerConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
  replyTo?: string
}

export function createMailer(
  config: MailerConfig,
  log: { info(obj: object, msg: string): void },
): Mailer {
  if (!config.enabled) {
    return {
      async sendMail(opts) {
        log.info(
          { to: opts.to, subject: opts.subject, from: opts.from ?? config.from },
          "email_notification_skipped",
        )
      },
      async close() {},
    }
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  })

  return {
    async sendMail(opts) {
      await transport.sendMail({
        from: opts.from ?? config.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      })
    },
    async close() {
      transport.close()
    },
  }
}
