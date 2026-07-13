import type { FastifyInstance } from "fastify"
import { checkPostgres, checkRedis } from "../lib/checks.js"

export async function readyRoutes(app: FastifyInstance) {
  app.get("/ready", { config: { rateLimit: false } }, async (_request, reply) => {
    const [pg, redis] = await Promise.allSettled([checkPostgres(), checkRedis()])

    const checks = {
      postgres: pg.status === "fulfilled" ? "ok" : "error",
      redis: redis.status === "fulfilled" ? "ok" : "error",
    }

    const healthy = Object.values(checks).every((v) => v === "ok")

    if (!healthy) {
      return reply.status(503).send({ status: "error", checks })
    }

    return { status: "ok", checks }
  })
}
