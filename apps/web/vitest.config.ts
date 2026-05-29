import path from "node:path"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Integration tests share a real Postgres instance — run files serially to
    // prevent cross-test-file races on the checkout_* tables (initiate vs
    // cancel both wipe the same shared tables in beforeEach). Mirrors
    // apps/api/vitest.config.ts.
    fileParallelism: false,
  },
})
