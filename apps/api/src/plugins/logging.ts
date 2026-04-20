import type { FastifyInstance } from "fastify"
import fp from "fastify-plugin"

export const loggingPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request) => {
    request.log.info({ method: request.method, url: request.url }, "incoming request")
  })

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      { method: request.method, url: request.url, statusCode: reply.statusCode },
      "request completed",
    )
  })
})
