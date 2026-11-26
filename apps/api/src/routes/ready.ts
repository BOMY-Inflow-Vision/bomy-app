import type { FastifyInstance } from "fastify"
import { checkPostgres, checkRedis } from "../lib/checks.js"
import { pspStatus } from "../lib/psp-status.js"

export async function readyRoutes(app: FastifyInstance) {
  app.get("/ready", { config: { rateLimit: false } }, async (_request, reply) => {
    const [pg, redis] = await Promise.allSettled([checkPostgres(), checkRedis()])

    const checks = {
      postgres: pg.status === "fulfilled" ? "ok" : "error",
      redis: redis.status === "fulfilled" ? "ok" : "error",
    }

    const healthy = Object.values(checks).every((v) => v === "ok")
    // Informational only: PSP config never changes the health verdict or the status code.
    const psp = pspStatus()

    if (!healthy) {
      return reply.status(503).send({ status: "error", checks, psp })
    }

    return { status: "ok", checks, psp }
  })
}
