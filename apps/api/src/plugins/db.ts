import { makeDb, type Db } from "@bomy/db"
import fp from "fastify-plugin"

declare module "fastify" {
  interface FastifyInstance {
    /** Application DB pool — use via withTenant / withAdmin. */
    db: Db
  }
}

export const dbPlugin = fp(async (app) => {
  const db = makeDb()

  app.decorate("db", db)

  app.addHook("onClose", async () => {
    await db.close()
  })
})
