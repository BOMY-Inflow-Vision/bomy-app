import { base } from "@bomy/config/eslint"
import tseslint from "typescript-eslint"

export default tseslint.config(
  ...base,
  // Fastify plugin/route functions are typed as async even when they only register
  // handlers synchronously — require-await produces constant false positives here.
  {
    files: ["apps/api/**/*.{ts,js,mjs}"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  // packages/mailer uses async interface methods that are no-ops in disabled mode
  // (sendMail logs synchronously, close is a no-op) — same pattern as apps/api.
  {
    files: ["packages/mailer/**/*.{ts,js,mjs}"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/build/**",
      ".turbo/**",
      "infra/**",
      "**/next-env.d.ts",
      // Plain-JS runtime scripts — not part of any TypeScript project
      "scripts/**",
      "packages/*/scripts/**",
      "apps/*/scripts/**",
      // Design-system handoff bundle — external reference material (tokens,
      // component mocks, a compiled preview bundle), not part of this repo's
      // TypeScript project or code style. See docs/design-system/README.md.
      "docs/design-system/**",
    ],
  },
)
