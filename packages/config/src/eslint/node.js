import { base } from "./base.js"
import tseslint from "typescript-eslint"

/**
 * ESLint config for Node.js apps (apps/api, packages/db, etc.).
 */
export const node = tseslint.config(...base, {
  rules: {
    "@typescript-eslint/no-misused-promises": "error",
    // Fastify plugin/route functions are typed as async (FastifyPluginAsync) even
    // when they only register hooks synchronously — require-await fires constantly.
    "@typescript-eslint/require-await": "off",
  },
})
