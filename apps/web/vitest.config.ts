import path from "node:path"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // tsconfig uses "jsx": "preserve" (Next compiles JSX itself), so source files do not import
  // React; without this, esbuild's classic transform fails with "React is not defined".
  esbuild: { jsx: "automatic" },
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
    // e2e/*.spec.ts are Playwright specs (run via `pnpm test:e2e`, own config
    // + runner) — vitest's default include glob matches *.spec.ts too and
    // would otherwise try to execute them itself.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "e2e/**"],
  },
})
