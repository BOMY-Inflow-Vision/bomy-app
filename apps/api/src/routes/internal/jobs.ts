import { Queue } from "bullmq"
import type { FastifyInstance } from "fastify"

import { VOUCHER_QUEUE_NAME } from "../../scheduler.js"

/**
 * Internal job trigger endpoints — callable only with the INTERNAL_API_SECRET
 * header. Used by apps/admin to trigger jobs on demand (e.g. "Issue Now").
 *
 * POST /internal/jobs/voucher-issuance
 */
export async function internalJobRoutes(app: FastifyInstance) {
  const secret = process.env["INTERNAL_API_SECRET"]

  app.post("/internal/jobs/voucher-issuance", async (request, reply) => {
    if (!secret) {
      return reply.status(503).send({ error: "INTERNAL_API_SECRET not configured" })
    }

    const auth = request.headers["authorization"]
    if (!auth || auth !== `Bearer ${secret}`) {
      return reply.status(401).send({ error: "Unauthorized" })
    }

    const redisUrl = process.env["REDIS_URL"]
    if (!redisUrl) {
      return reply.status(503).send({ error: "REDIS_URL not configured" })
    }

    const parsed = new URL(redisUrl)
    const connection = {
      host: parsed.hostname,
      port: parseInt(parsed.port || "6379", 10),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
    }

    const queue = new Queue(VOUCHER_QUEUE_NAME, { connection })
    try {
      await queue.add("manual-trigger", {})
    } finally {
      await queue.close()
    }

    return reply.status(202).send({ queued: true })
  })
}
