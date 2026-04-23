import { defineConfig } from "drizzle-kit"

const databaseUrl = process.env["DATABASE_URL"]
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required to run drizzle-kit. Set it in apps/api/.env.local or export it in the shell.",
  )
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
})
