import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share a real Postgres instance — run files serially to
    // prevent races between concurrent job executions (e.g. issueMonthlyVouchers
    // issuing vouchers to members seeded by other in-flight test files).
    fileParallelism: false,
  },
})
