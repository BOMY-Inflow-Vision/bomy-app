import cookie from "@fastify/cookie"
import sensible from "@fastify/sensible"
import Fastify from "fastify"

import { dbPlugin } from "./plugins/db.js"
import { loggingPlugin } from "./plugins/logging.js"
import { sessionPlugin } from "./plugins/session.js"
import { healthRoutes } from "./routes/health.js"
import { meRoutes } from "./routes/me.js"
import { readyRoutes } from "./routes/ready.js"

export async function createApp() {
  const isDev = process.env["NODE_ENV"] !== "production"

  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      ...(isDev && {
        transport: { target: "pino-pretty", options: { colorize: true } },
      }),
    },
  })

  await app.register(sensible)
  await app.register(cookie)
  await app.register(loggingPlugin)
  await app.register(dbPlugin)
  await app.register(sessionPlugin)

  await app.register(healthRoutes)
  await app.register(readyRoutes)
  await app.register(meRoutes)

  return app
}
