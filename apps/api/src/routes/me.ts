import { schema, withTenant } from "@bomy/db"
import { eq } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request, reply) => {
    if (!request.session) return reply.unauthorized()
    const { userId, userRole } = request.session

    return withTenant(app.db.db, { userId, userRole }, (tx) =>
      tx
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          image: schema.users.image,
          role: schema.users.role,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1)
        .then((rows) => rows[0] ?? reply.notFound()),
    )
  })
}
