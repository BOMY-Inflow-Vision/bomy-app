import Fastify from "fastify"
import sensible from "@fastify/sensible"
import { loggingPlugin } from "./plugins/logging.js"
import { healthRoutes } from "./routes/health.js"
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
  await app.register(loggingPlugin)
  await app.register(healthRoutes)
  await app.register(readyRoutes)

  return app
}
