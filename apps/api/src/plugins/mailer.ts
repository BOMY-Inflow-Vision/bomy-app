import fp from "fastify-plugin"

import { configFromEnv, createMailer, type Mailer } from "@bomy/mailer"

declare module "fastify" {
  interface FastifyInstance {
    mailer: Mailer
  }
}

export const mailerPlugin = fp(async (app) => {
  const config = configFromEnv(process.env)
  const mailer = createMailer(config, {
    info: (obj, msg) => app.log.info(obj, msg),
  })

  app.decorate("mailer", mailer)
  app.addHook("onClose", async () => {
    await mailer.close()
  })
})
