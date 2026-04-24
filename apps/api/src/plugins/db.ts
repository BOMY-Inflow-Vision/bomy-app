import { makeAuthDb, makeDb, type Db } from "@bomy/db"
import fp from "fastify-plugin"

declare module "fastify" {
  interface FastifyInstance {
    /** Application DB pool — use via withTenant / withAdmin. */
    db: Db
    /** Auth-only pool with app.bypass_rls set — used by session middleware. */
    authDb: Db
  }
}

export const dbPlugin = fp(async (app) => {
  const db = makeDb()
  const authDb = makeAuthDb()

  app.decorate("db", db)
  app.decorate("authDb", authDb)

  app.addHook("onClose", async () => {
    await Promise.all([db.close(), authDb.close()])
  })
})
