import type { FastifyInstance, FastifyRequest } from "fastify"

import { secretsMatch } from "../../lib/timing-safe-compare.js"

/**
 * TEMPORARY proxy-header diagnostic (GAPS #3).
 *
 * The rate limiter keys on `request.ip`, which under `trustProxy: 1` resolves to
 * the RIGHTMOST X-Forwarded-For entry — on Railway that is an edge-node IP that
 * rotates per connection, so the cap never accumulates (proved by the post-PR
 * #91 prod smoke: 90 fresh-connection webhook POSTs → 0× 429). Before changing
 * the keying we need to know, empirically, which header carries the real client
 * and whether Railway strips a caller-supplied one. This endpoint reports the
 * candidates so a probe can be correlated against Railway's edge log `srcIp`.
 *
 * Double-gated and inert on merge: it 404s unless ENABLE_IP_DIAGNOSTIC=1, and
 * then still requires the INTERNAL_API_SECRET bearer. **Delete this route once
 * the keying fix lands.**
 *
 * GET /internal/ip-debug
 */
export async function ipDebugRoutes(app: FastifyInstance) {
  app.get("/internal/ip-debug", async (request, reply) => {
    // 404 (not 403) while disabled: an unset flag should leave no trace that the
    // route exists, and this runs before any secret handling.
    if (process.env["ENABLE_IP_DIAGNOSTIC"] !== "1") {
      return reply.status(404).send({ error: "Not Found" })
    }

    const secret = process.env["INTERNAL_API_SECRET"]
    if (!secret) {
      return reply.status(503).send({ error: "INTERNAL_API_SECRET not configured" })
    }

    const auth = request.headers["authorization"]
    if (!auth || !secretsMatch(auth, `Bearer ${secret}`)) {
      return reply.status(401).send({ error: "Unauthorized" })
    }

    return reply.send({
      requestIp: request.ip,
      requestIps: request.ips ?? null,
      xForwardedFor: header(request, "x-forwarded-for"),
      xRealIp: header(request, "x-real-ip"),
      xEnvoyExternalAddress: header(request, "x-envoy-external-address"),
      fastlyClientIp: header(request, "fastly-client-ip"),
      xRailwayEdge: header(request, "x-railway-edge"),
      xRailwayRequestId: header(request, "x-railway-request-id"),
      socketRemoteAddress: request.socket.remoteAddress ?? null,
    })
  })
}

/** Raw header value, joined if the client sent it more than once. */
function header(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name]
  if (value === undefined) return null
  return Array.isArray(value) ? value.join(", ") : value
}
